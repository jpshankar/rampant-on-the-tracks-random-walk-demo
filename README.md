# Rampant on the Tracks - Random Walking

Rampant on the Tracks is an upcoming mobile game project of mine, more details to follow.

Key to its game mechanics are " walkers " moving according to the general concept of a " random walk " - a walk over a set of points where each movement is from current A to any adjacent point B, chosen with equal probability.

There are variants of the random walk where the probabilities are unequal. This demo implements something like that by having potential Bs not include any point previously visited:

```TypeScript
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
```

Instructions are displayed in the demo.

After setting up the walkers and starting a run, you will see the walkers progress until every single walker has reached an " end state ", a point where it cannot take any more steps.

This demo demonstrates the emergent behavior of several walkers simultaneously moving:

- The influence previous steps have on a walker's path (how constrained its steps become as it moves towards its end state)
- Walkers crossing each other's paths
- The visual appeal of processing several walkers moving simultaneously

Gameplay mechanics in Rampant on the Tracks will be derived from those:

- Understanding the behavior of specific walkers
- Steering walkers into desired end states
- Keeping track of the overall picture of moving walkers (and any effects that they would have on gameplay)