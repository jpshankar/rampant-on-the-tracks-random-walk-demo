'use client'

import Konva from 'konva';
import { useEffect, useState, useRef } from 'react';

import VECollection from "vecollection";
import useVECollection from "usevecollection";

import { sum, floorDiv, product } from 'extra-bigint';
import { rangeIterator } from '@hugoalh/range-iterator';

import randomColor from 'randomcolor';
import { useQueue } from '@uidotdev/usehooks';

import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// Using bigint here and other places where the values have no reason to be decimal.
interface GridIndices {
    widthIntervalIndex: bigint,
    heightIntervalIndex: bigint
}

enum GridEntityType {
    GridWalker,
    GridPoint
}

interface GridWalker {
    onGridAt: GridIndices,
    walkerColor: string,
    finishedWalk: boolean
}

enum StepDir {
    Up,
    Down,
    Left,
    Right
}

interface GridWalkerNextStep {
    nextStep: GridIndices,
    nextStepDir: StepDir
}

interface GridWalkerStepInfo {
    stepFrom: GridIndices,
    stepTo: GridIndices,
    stepDir: StepDir,
    lineColor: string,
    stepFinishedAnimatingAt?: number // Timestamp in milliseconds since the epoch marking when this step's animation completed. 
}

// pointX/Y in practice didn't end up being used - still saving the info here in case future iterations need it
interface GridPoint {
    pointX: number,
    pointY: number,
    scaledPointX: number,
    scaledPointY: number,
    pointIndices: GridIndices
};

enum InstructionsState {
    NoExtantWalker,
    AtLeastOneExtantWalker,
    GridWalkerRemoval,
    Running,
    Paused
}

type GridPointFunc = (_: number) => GridPoint[];

// Utility functions for bigint ops.
function bigIntDivisionResult(numerator: bigint, denominator: bigint): bigint {
    return floorDiv(numerator.valueOf(), denominator.valueOf());
}

function bigIntDivisionResultAsNumber(numerator: bigint, denominator: bigint): number {
    return Number(numerator)/Number(denominator);
}

function bigIntSubtractionResult(firstTerm: bigint, secondTerm: bigint): bigint {
    return sum(firstTerm.valueOf(), -secondTerm.valueOf());
}

function bigIntAdditionResult(firstTerm: bigint, secondTerm: bigint): bigint {
    return sum(firstTerm.valueOf(), secondTerm.valueOf());
}

function bigIntToNumber(bigInt: bigint): number {
    return Number(bigInt);
}

function mapToArrayNTimes<T>(n: bigint, mapFn: (_: bigint) => T): Array<T> {
    return Array.from(rangeIterator(zeroBigNumber.valueOf(), n.valueOf(), {excludeEnd: true})).map(mapFn);
}

const zeroBigNumber: bigint = 0n;
const oneBigNumber: bigint = 1n;
const tenBigNumber: bigint = 10n;

/* Width/height logic is partially based on an earlier iteration where it was configurable - that functionality's phased out for now.
    The displayed grid is represented as a numVerticalLines X numHorizontalLines grid
        width/heightIntervals refer to display width/height
        scaledWidth/HeightIntervals translates that configured width to the constant displayed size (baseWidth/Height)*/

const baseWidth: bigint = 500n;
const baseHeight: bigint = 500n;

const width: bigint = 1000n;
const widthInterval: bigint = 50n;
const numVerticalLines: bigint = bigIntDivisionResult(width, widthInterval);

const height: bigint = 500n;
const heightInterval: bigint = 50n;
const numHorizontalLines: bigint = bigIntDivisionResult(height, heightInterval);

const pointRadius: number = Math.min(bigIntDivisionResultAsNumber(widthInterval, tenBigNumber), bigIntDivisionResultAsNumber(heightInterval, tenBigNumber));

const verticalLineGapProportion: number = bigIntDivisionResultAsNumber(oneBigNumber, numVerticalLines);
const horizontalLineGapProportion: number = bigIntDivisionResultAsNumber(oneBigNumber, numHorizontalLines);

// Hardcoded offset to make displaying grid & walkers on Konva canvas look nice.
const canvasLineXYOffset: number = 15;

const widthIntervals: bigint[] = mapToArrayNTimes(numVerticalLines, (i) => product(widthInterval.valueOf(), i.valueOf()));
const scaledWidthIntervals: number[] = mapToArrayNTimes(numVerticalLines, (i) => (Number(i) * verticalLineGapProportion * bigIntToNumber(baseWidth)) + canvasLineXYOffset);

const heightIntervals: bigint[] = mapToArrayNTimes(numHorizontalLines, (i) => product(heightInterval.valueOf(), i.valueOf()));
const scaledHeightIntervals: number[] = mapToArrayNTimes(numHorizontalLines, (i) => (Number(i) * horizontalLineGapProportion * bigIntToNumber(baseHeight)) + canvasLineXYOffset);

const untraveledLineColor: string = '#000000'; // 'black'
const unoccupiedPointColor: string = '#FFFFFF'; // 'white'
const pointRemovalColor: string = '#FF0000'; // 'red'

function instructionsToShow(instructionsTypeShowing: InstructionsState): string  {
    switch (instructionsTypeShowing) {
        case InstructionsState.NoExtantWalker:
            return "Click on a point to add a walker.";
        case InstructionsState.Running:
            return "Press P to pause.\nPress E to reset."
        case InstructionsState.Paused:
            return "Press R to resume.\nPress E to reset."
        case InstructionsState.AtLeastOneExtantWalker:
            return "To add another walker, click on a point.\nTo delete the walker just added, click on the same point again.\nPress S to start walking.\nPress E to reset.";
        case InstructionsState.GridWalkerRemoval:
            return "Click on the point again to delete the walker.\nPress ESC to cancel.";
    }
}

// Constructing a should-be-unique string key as a shortcut around implementing/leveraging a Map with value equality.
function constructLineFromToKey(lineFrom: GridIndices, lineTo: GridIndices): string {
    const { widthIntervalIndex: fromWidthIntervalIndex, heightIntervalIndex: fromHeightIntervalIndex } = lineFrom;
    const { widthIntervalIndex: toWidthIntervalIndex, heightIntervalIndex: toHeightIntervalIndex } = lineTo;

    return `${fromWidthIntervalIndex}_${fromHeightIntervalIndex}_${toWidthIntervalIndex}_${toHeightIntervalIndex}`;
}

gsap.registerPlugin(useGSAP);

export default function Grid() {
    const [instructionsState, setInstructionsState] = useState<InstructionsState>(InstructionsState.NoExtantWalker);

    const { addToCollection: addGridWalker, removeFromCollection: removeGridWalker, removeFirstFoundFromCollection: removeFirstMatchingGridWalker, clearCollection: clearGridWalkers, collection: gridWalkers } = useVECollection<GridWalker>();
    const [latestWalkerAdded, setLatestWalkerAdded] = useState<GridWalker | undefined>(undefined);

    const { addToCollection: addGridStepTaken, removeFromCollection: removeGridStepTaken, removeFirstFoundFromCollection: removeFirstMatchingGridStep, clearCollection: clearGridWalkerSteps, collection: gridStepsTakenSoFar} = useVECollection<GridWalkerStepInfo>();

    const { add: addWalkerTakingNextStep, clear: clearWalkersTakingNextStep, queue: walkersTakingNextStep } = useQueue<GridWalker>();
    const { add: addWalkerFinishingStep, clear: clearWalkersFinishingSteps, queue: walkersFinishingSteps } = useQueue<GridWalkerStepInfo>();
    
    const [gridEditFocus, setGridEditFocus] = useState<GridIndices | undefined>(undefined);
    
    const [stepping, setStepping] = useState(false);

    const stageContainerRef = useRef(null);

    const chooseNextStep = ({ widthIntervalIndex, heightIntervalIndex }: GridIndices, stepperColor: string): GridWalkerNextStep => {
        const possibleLeftStep = {nextStep: { widthIntervalIndex: bigIntSubtractionResult(widthIntervalIndex, oneBigNumber), heightIntervalIndex: heightIntervalIndex}, nextStepDir: StepDir.Left};
        const possibleRightStep = { nextStep: { widthIntervalIndex: bigIntAdditionResult(widthIntervalIndex, oneBigNumber), heightIntervalIndex: heightIntervalIndex}, nextStepDir: StepDir.Right };
        const possibleUpStep = { nextStep: { widthIntervalIndex: widthIntervalIndex, heightIntervalIndex: bigIntSubtractionResult(heightIntervalIndex, oneBigNumber) }, nextStepDir: StepDir.Up };
        const possibleDownStep = { nextStep: { widthIntervalIndex: widthIntervalIndex, heightIntervalIndex: bigIntAdditionResult(heightIntervalIndex, oneBigNumber) }, nextStepDir: StepDir.Down };

        const possibleSteps: GridWalkerNextStep[] = [possibleLeftStep, possibleRightStep, possibleUpStep, possibleDownStep];
        
        // Choose from next steps within the grid that this walker hasn't crossed onto before.
        const possibleNextSteps = possibleSteps.filter(
            ({nextStep: { widthIntervalIndex, heightIntervalIndex }}) => {
                const wouldBePreviousStep = 
                    gridStepsTakenSoFar.returnFirstOccurrenceIfFound(
                        ({stepFrom: {widthIntervalIndex: fromWidthIntervalIndex, heightIntervalIndex: fromHeightIntervalIndex}, lineColor }) =>
                            widthIntervalIndex === fromWidthIntervalIndex && heightIntervalIndex === fromHeightIntervalIndex && lineColor === stepperColor
                    );

                return !wouldBePreviousStep &&
                widthIntervalIndex >= zeroBigNumber && 
                widthIntervalIndex.valueOf() < numVerticalLines.valueOf() && 
                heightIntervalIndex >= zeroBigNumber && 
                heightIntervalIndex.valueOf() < numHorizontalLines.valueOf();
            }
        );

        return possibleNextSteps[Math.floor(Math.random() * possibleNextSteps.length)];
    };

    const walkerStep = (gridWalker: GridWalker): GridWalkerStepInfo | undefined => {
        const { onGridAt: fromIndices, walkerColor } = gridWalker;
        const nextStepToTake = chooseNextStep(fromIndices, walkerColor);

        if (nextStepToTake) {
            const { nextStep, nextStepDir } = nextStepToTake;
            return { stepFrom: fromIndices, stepTo: nextStep, lineColor: walkerColor, stepDir: nextStepDir };
        } else {
            return undefined;
        }
    };

    useEffect(() => {
        if (stageContainerRef.current) {
            const constrainByWidth: GridPointFunc = (widthIndex: number) => {
                return mapToArrayNTimes(numHorizontalLines, (heightIndex) => {
                        const heightIndexNum = Number(heightIndex);
                        return { 
                            pointX: Number(widthIntervals[widthIndex]), 
                            pointY: Number(heightIntervals[heightIndexNum]), 
                            scaledPointX: scaledWidthIntervals[widthIndex], 
                            scaledPointY: scaledHeightIntervals[heightIndexNum], 
                            pointIndices: { widthIntervalIndex: BigInt(widthIndex).valueOf(), heightIntervalIndex: heightIndex.valueOf() }
                        };
                    }
                );
            };

            const constrainByHeight: GridPointFunc = (heightIndex: number) => {
                // technically the same code as constrainByWidth, but doing it this way saves on awkward usages of the ternary operator
                return mapToArrayNTimes(numVerticalLines, (widthIndex) => {
                        const widthIndexNum = Number(widthIndex);
                        return { 
                            pointX: Number(widthIntervals[widthIndexNum]), 
                            pointY: Number(heightIntervals[heightIndex]), 
                            scaledPointX: scaledWidthIntervals[widthIndexNum], 
                            scaledPointY: scaledHeightIntervals[heightIndex], 
                            pointIndices: { widthIntervalIndex: widthIndex, heightIntervalIndex: BigInt(heightIndex).valueOf()}} 
                    
                    }
                );
            };

            // We constrain by the smallest of the two sets to avoid array index exceptions on accessing them with an index from the larger set.
            const pointsArray: GridPoint[] = 
                scaledWidthIntervals.length < scaledHeightIntervals.length ? 
                    scaledWidthIntervals.map((_, widthIndex) => constrainByWidth(widthIndex)).flat() : 
                    scaledHeightIntervals.map((_, heightIndex) => constrainByHeight(heightIndex)).flat();

            const points: VECollection<GridPoint> = new VECollection<GridPoint>(new Set<GridPoint>(pointsArray));
            
            const stage = new Konva.Stage({container: "stageContainer", width: Number(width), height: Number(height)})
            const layer = new Konva.Layer();

            stage.add(layer);

            const stepsToAnimate = gridStepsTakenSoFar.filter((stepTaken) => !("stepFinishedAnimatingAt" in stepTaken));
            const stepsTimeline = gsap.timeline();
            
            stepsToAnimate.forEach(
                (stepToAnimate) => {
                    const { stepFrom, stepTo, lineColor } = stepToAnimate

                    const { widthIntervalIndex: fromWidthIntervalIndex, heightIntervalIndex: fromHeightIntervalIndex } = stepFrom
                    const { widthIntervalIndex: toWidthIntervalIndex, heightIntervalIndex: toHeightIntervalIndex } = stepTo

                    const fromX = scaledWidthIntervals[bigIntToNumber(fromWidthIntervalIndex)];
                    const toX = scaledWidthIntervals[bigIntToNumber(toWidthIntervalIndex)];

                    const fromY = scaledHeightIntervals[bigIntToNumber(fromHeightIntervalIndex)];
                    const toY = scaledHeightIntervals[bigIntToNumber(toHeightIntervalIndex)];

                    const walker = new Konva.Circle(
                        {
                            x: fromX,
                            y: fromY,
                            radius: pointRadius,
                            fill: lineColor,
                            stroke: untraveledLineColor,
                            opacity: 0.5
                        }
                    )

                    layer.add(walker);
                    
                    // If the demo is paused, this specific line just immediately completes - would need revision of animation handling to do otherwise.
                    const linePoints = stepping ? [fromX, fromY, fromX, fromY] : [fromX, fromY, toX, toY];

                    const walkerLine = new Konva.Line(
                        {
                            points: linePoints,
                            stroke: lineColor,
                            opacity: 0.5
                        }
                    )

                    layer.add(walkerLine);

                    // Draw walker above walkerLine.
                    walkerLine.moveToTop();
                    walker.moveToTop();

                    if (stepping) {
                        const stepTween = gsap.to(
                            walker, 
                            {
                                duration: 1.5, 
                                startAt: {x: fromX, y: fromY },
                                x: toX,
                                y: toY,
                                ease: "expo.inOut", 
                                onUpdate: () => {
                                    walkerLine.points([fromX, fromY, walker.x(), walker.y()]);
                                },
                                onComplete: () => {
                                    removeGridStepTaken(stepToAnimate);

                                    const walkerStepAfterAnimation: GridWalkerStepInfo = {
                                        ...stepToAnimate, stepFinishedAnimatingAt: Date.now()
                                    };

                                    // Attempt to remove any previous lines with matching keys, so that we only draw this latest one.
                                    const stepFromToKey = constructLineFromToKey(stepFrom, stepTo);
                                    const stepToFromKey = constructLineFromToKey(stepTo, stepFrom);
                                    
                                    removeFirstMatchingGridStep(
                                        ({stepFrom, stepTo}) => {
                                            return constructLineFromToKey(stepFrom, stepTo) === stepFromToKey;
                                        }
                                    )

                                    removeFirstMatchingGridStep(
                                        ({stepFrom, stepTo}) => {
                                            return constructLineFromToKey(stepTo, stepFrom) === stepToFromKey;
                                        }
                                    )

                                    addGridStepTaken(walkerStepAfterAnimation);
                                }
                            }
                        );

                        stepsTimeline.add(stepTween, "<");
                    }
                } 
            );

            const stepsFinishedAnimating = gridStepsTakenSoFar.filter(stepTaken => "stepFinishedAnimatingAt" in stepTaken);
            
            stepsFinishedAnimating.forEach(
                (stepAlreadyAnimated) => {
                    const {stepFrom, stepTo, lineColor} = stepAlreadyAnimated;

                    const { widthIntervalIndex: fromWidthIntervalIndex, heightIntervalIndex: fromHeightIntervalIndex } = stepFrom
                    const { widthIntervalIndex: toWidthIntervalIndex, heightIntervalIndex: toHeightIntervalIndex } = stepTo

                    const fromX = scaledWidthIntervals[bigIntToNumber(fromWidthIntervalIndex)];
                    const toX = scaledWidthIntervals[bigIntToNumber(toWidthIntervalIndex)];

                    const fromY = scaledHeightIntervals[bigIntToNumber(fromHeightIntervalIndex)];
                    const toY = scaledHeightIntervals[bigIntToNumber(toHeightIntervalIndex)];

                    const linePoints = [fromX, fromY, toX, toY];
                    
                    const line = new Konva.Line(
                        {
                            points: linePoints,
                            stroke: lineColor
                        }
                    );

                    layer.add(line);
                    line.moveToBottom();
                    
                    const walkerStillAtFrom = gridWalkers.returnFirstOccurrenceIfFound(
                        ({onGridAt: {widthIntervalIndex: gridWalkerWidthIntervalIndex, heightIntervalIndex: gridWalkerHeightIntervalIndex}, walkerColor: gridWalkerColor}) =>
                            fromWidthIntervalIndex === gridWalkerWidthIntervalIndex && fromHeightIntervalIndex === gridWalkerHeightIntervalIndex && lineColor === gridWalkerColor
                    );

                    if (walkerStillAtFrom && stepping) {
                        addWalkerFinishingStep(stepAlreadyAnimated);
                    }
                }
            );

            const handleClickingOnPointShape = (shapeEntityType: GridEntityType, pointClickedOn: GridIndices) => {
                const canUpdateWalkerState = instructionsState === InstructionsState.NoExtantWalker || instructionsState === InstructionsState.AtLeastOneExtantWalker || instructionsState === InstructionsState.GridWalkerRemoval;
                if (canUpdateWalkerState) {
                    if (shapeEntityType === GridEntityType.GridWalker) {
                        // Did we select the walker for removal, or confirm that we want to remove it?
                        const clickIsAfterRemovalInstructions = instructionsState >= InstructionsState.GridWalkerRemoval
                        
                        if (clickIsAfterRemovalInstructions) {
                            if (gridEditFocus) {
                                const { widthIntervalIndex: editFocusWidthIntervalIndex, heightIntervalIndex: editFocusHeightIntervalIndex } = gridEditFocus;
                                const { widthIntervalIndex: pointWidthIntervalIndex, heightIntervalIndex: pointHeightIntervalIndex } = pointClickedOn;

                                if (editFocusWidthIntervalIndex === pointWidthIntervalIndex && editFocusHeightIntervalIndex === pointHeightIntervalIndex) {
                                    const findPreviousGridWalker: (_: GridWalker) => boolean = 
                                        ({onGridAt: {widthIntervalIndex: otherWidthIntervalIndex, heightIntervalIndex: otherHeightIntervalIndex}}) => {
                                            return pointWidthIntervalIndex === otherWidthIntervalIndex && pointHeightIntervalIndex === otherHeightIntervalIndex;
                                        }

                                    removeFirstMatchingGridWalker(findPreviousGridWalker);
                                    setGridEditFocus(undefined);

                                    // Did we remove the last walker?
                                    const instructionsStateAfterRemoval = gridWalkers.size() === 1 ? InstructionsState.NoExtantWalker : InstructionsState.AtLeastOneExtantWalker;
                                    setInstructionsState(instructionsStateAfterRemoval);
                                }
                            }
                        } else {
                            setInstructionsState(InstructionsState.GridWalkerRemoval);
                            setGridEditFocus(pointClickedOn);
                        }
                    } else if (shapeEntityType === GridEntityType.GridPoint) {
                        setLatestWalkerAdded({ onGridAt: pointClickedOn, walkerColor: randomColor(), finishedWalk: false });
                        setGridEditFocus(pointClickedOn);
                    }
                }
            }

            points.forEach(
                ({scaledPointX, scaledPointY, pointIndices}) => {
                    const { widthIntervalIndex: pointWidthIntervalIndex, heightIntervalIndex: pointHeightIntervalIndex } = pointIndices;           
                    
                    const maybeWalker = 
                        gridWalkers.returnFirstOccurrenceIfFound(
                            ({onGridAt: {widthIntervalIndex: walkerWidthIntervalIndex, heightIntervalIndex: walkerHeightIntervalIndex}, }) => 
                                pointWidthIntervalIndex === walkerWidthIntervalIndex && pointHeightIntervalIndex == walkerHeightIntervalIndex
                        );

                    const [pointEntityType, pointColor] = maybeWalker ? [GridEntityType.GridWalker, maybeWalker.walkerColor] : [GridEntityType.GridPoint, unoccupiedPointColor];
                    
                    const isGridEditFocus = gridEditFocus && (gridEditFocus.widthIntervalIndex === pointWidthIntervalIndex && gridEditFocus.heightIntervalIndex === pointHeightIntervalIndex)

                    const strokeColor = instructionsState === InstructionsState.GridWalkerRemoval && isGridEditFocus ? pointRemovalColor : untraveledLineColor;

                    const pointCircle = new Konva.Circle({
                        x: scaledPointX,
                        y: scaledPointY,
                        radius: pointRadius,
                        fill: pointColor,
                        stroke: strokeColor
                    });

                    pointCircle.on('click', () => {
                        handleClickingOnPointShape(pointEntityType, pointIndices);
                    });

                    layer.add(pointCircle);
                    pointCircle.moveToBottom();
                }
            );
            
            const keyDownListener: (_: globalThis.KeyboardEvent) => void = 
                ({key}) => {
                    const atLeastOneExtantWalker = gridWalkers.isNonEmpty()
                    switch (key.toLowerCase()) {
                        case "s":
                            if (instructionsState === InstructionsState.AtLeastOneExtantWalker) {
                                setStepping(true);
                                gridWalkers.forEach((gridWalker) => addWalkerTakingNextStep(gridWalker));
                                setInstructionsState(InstructionsState.Running);
                            }
                            break;
                        case "p":
                            if (instructionsState === InstructionsState.Running) {
                                setStepping(false);
                                setInstructionsState(InstructionsState.Paused);
                            }
                            break;
                        case "r":
                            if (instructionsState === InstructionsState.Paused) {
                                setStepping(true);
                                setInstructionsState(InstructionsState.Running);
                            }
                            break;
                        case "e":
                            if (instructionsState !== InstructionsState.NoExtantWalker && instructionsState !== InstructionsState.GridWalkerRemoval) {
                                setGridEditFocus(undefined);
                                clearGridWalkers();
                                clearGridWalkerSteps();
                                clearWalkersTakingNextStep();
                                clearWalkersFinishingSteps();
                                setInstructionsState(InstructionsState.NoExtantWalker);
                            }
                            break;
                        case "escape":
                            if (instructionsState === InstructionsState.GridWalkerRemoval) {
                                setInstructionsState(atLeastOneExtantWalker ? InstructionsState.AtLeastOneExtantWalker : InstructionsState.NoExtantWalker);
                            }
                            break;
                        default:
                            break;
                    }
                };

            window.addEventListener("keydown", keyDownListener);

            return () => {
                stage.destroyChildren(); 
                stage.off('dblclick');

                stage.destroy();
                layer.destroy();

                window.removeEventListener('keydown', keyDownListener);
            };
        }
    }, [gridWalkers, gridStepsTakenSoFar, instructionsState]);

    useEffect(() => {
        if (latestWalkerAdded) {
            const { onGridAt: { widthIntervalIndex: latestWalkerWidthIntervalIndex, heightIntervalIndex: latestWalkerHeightIntervalIndex }} = latestWalkerAdded

            removeFirstMatchingGridWalker(
                ({onGridAt: {widthIntervalIndex: otherWidthIntervalIndex, heightIntervalIndex: otherHeightIntervalIndex}}) => {
                    return latestWalkerWidthIntervalIndex === otherWidthIntervalIndex && latestWalkerHeightIntervalIndex === otherHeightIntervalIndex;
                }
            );
            
            addGridWalker(latestWalkerAdded);
            setLatestWalkerAdded(undefined);

            if (instructionsState === InstructionsState.NoExtantWalker) {
                setInstructionsState(InstructionsState.AtLeastOneExtantWalker);
            }
        }
        
        return () => {};
    }, [latestWalkerAdded]);

    useEffect(() => {
        if (walkersTakingNextStep.length > 0) {
           for (const walkerToUpdate of walkersTakingNextStep) {
                const walkerNextStep = walkerStep(walkerToUpdate);
                if (walkerNextStep) {
                    addGridStepTaken(walkerNextStep);
                } else {
                    removeGridWalker(walkerToUpdate);
                    
                    const walkerNoMoreSteps: GridWalker = {...walkerToUpdate, finishedWalk: true};
                    addGridWalker(walkerNoMoreSteps);
                }
           }
           clearWalkersTakingNextStep();
        }
    }, [walkersTakingNextStep]);

    useEffect(() => {
        if (walkersFinishingSteps.length > 0) {
            for (const walkerFinishingStep of walkersFinishingSteps) {
                const { stepFrom, stepTo, lineColor } = walkerFinishingStep;

                removeGridWalker({ onGridAt: stepFrom, walkerColor: lineColor, finishedWalk: false });
                
                const walkerAfterAnimation: GridWalker = { onGridAt: stepTo, walkerColor: lineColor, finishedWalk: false };
                
                addGridWalker(walkerAfterAnimation);
                addWalkerTakingNextStep(walkerAfterAnimation);
            }
            clearWalkersFinishingSteps();
        }
    }, [walkersFinishingSteps]);

    return (
        <div>
            <div ref={stageContainerRef} id = "stageContainer"/>
            <div>{instructionsToShow(instructionsState)}</div>
            {instructionsState >= InstructionsState.Running && <div>{gridWalkers.filter(({finishedWalk}) => !finishedWalk).size()} walkers active.</div>}
        </div>
    );
}