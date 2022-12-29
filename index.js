const { Worker, isMainThread, parentPort } = require("worker_threads");
const MAX_EXECUTION_STEPS = 500;
const MAX_PARENT = 100;
const FAILED_RESULT = 99999999;
const CONDITION_VALUES = {
  RED: "r",
  GREEN: "g",
  BLUE: "b",
  NONE: "_",
};

const COMMAND_VALUES = {
  FORWARD: "f",
  TURN_LEFT: "l",
  TURN_RIGHT: "r",
  PAINT_RED: "R",
  PAINT_GREEN: "G",
  PAINT_BLUE: "B",
  CALL_1: "1",
  CALL_2: "2",
  CALL_3: "3",
  CALL_4: "4",
  CALL_5: "5",
  NONE: "_",
};

const MUTATE_TYPES = {
  ALTER: 0,
  INSERT: 1,
  REMOVE: 2,
  SWAP: 3,
};

const pickRandom = (a) => a[Math.floor(Math.random() * a.length)];

const randomWithProbabilities = (probabilities) => {
  // Sum the probabilities to get the total probability
  const totalProbability = probabilities.reduce((sum, p) => sum + p, 0);

  // Generate a random number between 0 and the total probability
  const randomNumber = Math.random() * totalProbability;

  // Iterate over the probabilities and return the corresponding value
  // when the random number is within the range of the probability
  let cumulativeProbability = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulativeProbability += probabilities[i];
    if (randomNumber < cumulativeProbability) {
      return i;
    }
  }
};

const randCond = (config) => {
  const groups = [
    [CONDITION_VALUES.NONE],
    [
      CONDITION_VALUES.RED,
      CONDITION_VALUES.GREEN,
      CONDITION_VALUES.BLUE,
    ].filter((x) => config.allow_conds.includes(x)),
  ];
  const p = [0.6, groups[1].length === 0 ? 0 : 0.4];
  const r = randomWithProbabilities(p);
  return pickRandom(groups[r]);
};

const randCommand = (config) => {
  const COMMANDS_MOVE = [
    COMMAND_VALUES.FORWARD,
    COMMAND_VALUES.TURN_LEFT,
    COMMAND_VALUES.TURN_RIGHT,
  ].filter((x) => config.allow_commands.includes(x));
  const COMMANDS_PAINT = [
    COMMAND_VALUES.PAINT_RED,
    COMMAND_VALUES.PAINT_GREEN,
    COMMAND_VALUES.PAINT_BLUE,
  ].filter((x) => config.allow_commands.includes(x));
  const COMMANDS_CALL = [
    COMMAND_VALUES.CALL_1,
    COMMAND_VALUES.CALL_2,
    COMMAND_VALUES.CALL_3,
    COMMAND_VALUES.CALL_4,
    COMMAND_VALUES.CALL_5,
  ].filter((x) => config.allow_commands.includes(x));
  const groups = [
    [COMMAND_VALUES.NONE],
    COMMANDS_MOVE,
    COMMANDS_PAINT,
    COMMANDS_CALL,
  ];
  const p = [
    0,
    COMMANDS_MOVE.length === 0 ? 0 : 0.66,
    COMMANDS_PAINT.length === 0 ? 0 : 0.33,
    COMMANDS_CALL.length === 0 ? 0 : 0.248,
  ];
  const r = randomWithProbabilities(p);
  return pickRandom(groups[r]);
};

const randAction = (config) => `${randCond(config)}${randCommand(config)}`;

const convertProgramToString = (program) =>
  program.map((func) => func.join("")).join("|");

const distance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  // Return the distance using the Pythagorean theorem
  return Math.sqrt(dx * dx + dy * dy);
};

const isStar = (cell) => cell === "R" || cell === "G" || cell === "B";
const convertPostitionToString = (p) => `${p.x},${p.y}`;

/*
Now that the robot has been programmed, we can use this EA to optimize its actions and find a solution to the puzzle.

You may need to adjust the fitness function and mutation/crossover operators to suit the specific requirements and constraints of the puzzle.

Take care to consider the trade-offs and limitations of using an EA, and be sure to test and debug your solution thoroughly.
*/
const trySolution = (config, program) => {
  // Initialize the result object with default values
  const result = {
    steps: 0,
    collected: 0,
    totalRemainingItemsDistance: 99,
    nearestItemDistance: 99,
    visited: 0,
  };
  // Create a copy of the puzzle board
  const board = [...config.board.map((x) => [...x])];
  const visited = new Set();
  let currentPosition = { ...config.start };
  visited.add(convertPostitionToString(currentPosition));
  /*
  // a flag to detect infinite loops
  let infLoop = false;
  // Check for self calls without condition in the program
  for (let i = 0; i < program.length; i++) {
    if (
      program[i].some(
        (x) => x[0] === CONDITION_VALUES.NONE && x[1] == (i + 1).toString()
      )
    )
      infLoop = true;
  }
  // If there is an infinite loop, mark the result as a failure
  if (infLoop) {
    result.steps = FAILED_RESULT;
    return result;
  }
  */
  // Initialize the execution stack with the first function
  const runStack = [{ f: 0, step: 0 }];
  let execStep = 0;
  while (runStack.length !== 0 && execStep < MAX_EXECUTION_STEPS) {
    execStep++;
    const currentStack = runStack[runStack.length - 1];
    if (config.functionSizes[currentStack.f] === currentStack.step) {
      runStack.pop();
      continue;
    }
    const [cond, command] = program[currentStack.f][currentStack.step];
    const currentCell = board[currentPosition.y][currentPosition.x];
    if (cond !== CONDITION_VALUES.NONE && cond !== currentCell.toLowerCase()) {
      currentStack.step++;
      continue;
    }
    switch (command) {
      case COMMAND_VALUES.FORWARD:
        const newPostition = { ...currentPosition };
        switch (currentPosition.a) {
          case 0:
            newPostition.y--;
            break; // N
          case 1:
            newPostition.x++;
            break; // E
          case 2:
            newPostition.y++;
            break; // S
          case 3:
            newPostition.x--;
            break; // W
        }
        // bound check
        if (
          newPostition.y < 0 ||
          newPostition.y >= board.length ||
          newPostition.x < 0 ||
          newPostition.x >= board[0].length
        ) {
          //result.steps = FAILED_RESULT;
          return result;
        }
        const newPosCell = board[newPostition.y][newPostition.x];
        if (newPosCell === " ") {
          //result.steps = FAILED_RESULT;
          return result;
        }
        if (isStar(newPosCell)) {
          result.collected++;
          if (result.collected === config.itemsToCollect) {
            result.totalRemainingItemsDistance = 0;
            result.nearestItemDistance = 0;
            return result;
          }
          board[newPostition.y][newPostition.x] = newPosCell.toLowerCase();
        }
        currentPosition = { ...newPostition };
        visited.add(convertPostitionToString(currentPosition));
        currentStack.step++;
        result.steps++;
        break;
      case COMMAND_VALUES.TURN_LEFT:
        currentPosition.a--;
        if (currentPosition.a < 0) currentPosition.a = 3;
        currentStack.step++;
        result.steps++;
        break;
      case COMMAND_VALUES.TURN_RIGHT:
        currentPosition.a++;
        if (currentPosition.a > 3) currentPosition.a = 0;
        currentStack.step++;
        result.steps++;
        break;
      case COMMAND_VALUES.PAINT_RED:
      case COMMAND_VALUES.PAINT_GREEN:
      case COMMAND_VALUES.PAINT_BLUE:
        board[currentPosition.y][currentPosition.x] = command.toLowerCase();
        currentStack.step++;
        result.steps++;
        break;
      case COMMAND_VALUES.CALL_1:
      case COMMAND_VALUES.CALL_2:
      case COMMAND_VALUES.CALL_3:
      case COMMAND_VALUES.CALL_4:
      case COMMAND_VALUES.CALL_5:
        runStack.push({ f: parseInt(command, 10) - 1, step: 0 });
        currentStack.step++;
        break;
      default:
        currentStack.step++;
        break;
    }
  }
  if (execStep >= MAX_EXECUTION_STEPS) {
    //result.steps = FAILED_RESULT;
    return result;
  }
  let totalRemainingItemsDistance = 0;
  let nearestItemDistance = 99;
  for (let i = 0; i < config.board[0].length; i++)
    for (let j = 0; j < config.board.length; j++)
      if (isStar(board[j][i])) {
        const distanceToItem = distance(currentPosition, { x: i, y: j });
        totalRemainingItemsDistance += distanceToItem;
        if (distanceToItem < nearestItemDistance)
          nearestItemDistance = distanceToItem;
      }
  result.totalRemainingItemsDistance = totalRemainingItemsDistance;
  result.nearestItemDistance =
    totalRemainingItemsDistance === 0 ? 0 : nearestItemDistance;
  result.visited = visited.size;
  return result;
};

const mutateProgram = (config, program) => {
  const ret = [...program.map((func) => [...func])];
  const subToChange = Math.floor(Math.random() * ret.length);
  const subLength = ret[subToChange].length;
  let r = Math.random();
  const i = Math.floor(Math.random() * subLength);
  let mutateType;
  if (r < 0.7) {
    r = Math.random();
    mutateType = r < 0.3 ? MUTATE_TYPES.SWAP : MUTATE_TYPES.ALTER;
  } else {
    mutateType = pickRandom([MUTATE_TYPES.INSERT, MUTATE_TYPES.REMOVE]);
  }
  switch (mutateType) {
    case MUTATE_TYPES.SWAP:
      const j = Math.floor(Math.random() * subLength);
      const tmp = ret[subToChange][i];
      ret[subToChange][i] = ret[subToChange][j];
      ret[subToChange][j] = tmp;
      break;
    case MUTATE_TYPES.ALTER:
      ret[subToChange][i] = randAction(config);
      break;
    case MUTATE_TYPES.INSERT:
      for (let j = subLength - 1; j > i; j--)
        ret[subToChange][j] = ret[subToChange][j - 1];
      ret[subToChange][i] = randAction(config);
      break;
    case MUTATE_TYPES.REMOVE:
      for (let j = i; j < subLength - 1; j++)
        ret[subToChange][j] = ret[subToChange][j + 1];
      ret[subToChange][
        subLength - 1
      ] = `${CONDITION_VALUES.NONE}${COMMAND_VALUES.NONE}`;
      break;
  }
  return ret;
};

const generateRandomProgram = (config) => {
  const ret = [];
  for (const functionSize of config.functionSizes) {
    const sub = [];
    for (let i = 0; i < functionSize; i++) sub.push(randAction(config));
    ret.push(sub);
  }
  return ret;
};

const fitness = (config, program) => {
  const score = trySolution(config, program);
  // My target is just collected all star, so I dont care the rest...hehe
  return score.collected;
  /*
  return Math.floor(
    30 * score.collected +
      10 * score.visited +
      -1 * score.steps +
      -5 * score.totalRemainingItemsDistance +
      -5 * score.nearestItemDistance
  );*/
};

// the threshold at which the evolution process will be reset if it does not produce a valid solution.
const FAILURE_THRESHOLD = 5000;

// the maximum number of offspring that can be produced in each generation.
const OFFSPRING = 500;

// Number of workers to use
const N_WORKERS = 10;

const defer = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const calculateFitnessValues = async (config, population) => {
  // Create an array of workers
  const workers = Array.from(
    { length: N_WORKERS },
    () => new Worker(__filename)
  );
  let promises = Array.from({ length: population.length }, () => defer());
  workers.forEach((worker) =>
    worker.on("message", (data) => {
      promises[data.id].resolve(data.fitnessValue);
    })
  );
  // Send data to one worker at a time
  for (let i = 0; i < population.length; i++) {
    const data = { config: config, program: population[i], id: i };
    const worker = workers[i % N_WORKERS];
    worker.postMessage(data);
  }

  // Array to store fitness values
  const fitnessValues = await Promise.all(
    promises.map(({ promise }) => promise)
  );

  // Clean up workers and return fitnessValues
  workers.forEach((worker) => worker.terminate());
  return fitnessValues;
};

const countItems = (config) => {
  let needCollected = 0;
  for (let i = 0; i < config.board[0].length; i++)
    for (let j = 0; j < config.board.length; j++)
      if (isStar(config.board[j][i])) needCollected++;
  return needCollected;
};

const solver = async (config) => {
  console.log(`Start at: ${new Date().toISOString()}`);
  // Initialize the population with random programs
  let population = [];
  let populationSet = new Set();
  for (let i = 0; i < OFFSPRING; i++) {
    const program = generateRandomProgram(config);
    const programHash = convertProgramToString(program);
    populationSet.add(programHash);
    population.push(program);
  }
  let generation = 0;
  let resetCounter = 0;
  while (true) {
    // Calculate the fitness of each individual
    let fitnessValues = await calculateFitnessValues(config, population);

    // Select the fittest individual
    let topScores = [...new Set([...fitnessValues])]
      .sort((a, b) => b - a)
      .slice(0, 3);
    let maxScore = topScores[0];
    let maxIndex = fitnessValues.indexOf(maxScore);
    let fittest = population[maxIndex];

    // Check if the fittest individual is a valid solution
    if (trySolution(config, fittest).collected === config.itemsToCollect) {
      // Print the solution
      console.log(
        `End at: ${new Date().toISOString()}, with ${resetCounter} times`
      );
      console.log(convertProgramToString(fittest));
      break;
    } else {
      console.log(`Generation #${generation}`);
      console.log(
        convertProgramToString(fittest),
        "collected",
        trySolution(config, fittest).collected,
        "score",
        maxScore
      );
    }

    // Increment the generation counter
    generation++;

    // Check if the maximum number of generations has been reached
    if (generation === FAILURE_THRESHOLD) {
      // Reset the generation counter and initialize a new population
      generation = 0;
      population = [];
      populationSet = new Set();
      for (let i = 0; i < OFFSPRING; i++) {
        const program = generateRandomProgram(config);
        const programHash = convertProgramToString(program);
        populationSet.add(programHash);
        population.push(program);
      }
      resetCounter++;
      console.log("Reset");
      continue;
    }

    // Create a new population by generating children from the fittest programs
    let newPopulation = [];
    let parentCounter = 0;
    const parentSet = new Set();
    const newPopulationSet = new Set();
    for (let pIdx = 0; pIdx < population.length; pIdx++) {
      if (!topScores.includes(fitnessValues[pIdx])) continue;
      const parent = population[pIdx];
      const parentHash = convertProgramToString(parent);
      if (parentSet.has(parentHash)) continue;
      parentSet.add(parentHash);
      for (let i = 0; i < Math.floor(OFFSPRING); i++) {
        let child = mutateProgram(config, parent);
        for (
          let j = 0;
          j <
          Math.floor(
            (Math.random() * config.functionSizes.reduce((a, b) => a + b, 0)) /
              2
          );
          j++
        )
          child = mutateProgram(config, child);
        let childHash = convertProgramToString(child);
        while (
          populationSet.has(childHash) ||
          newPopulationSet.has(childHash)
        ) {
          child = mutateProgram(config, child);
          childHash = convertProgramToString(child);
        }
        populationSet.add(childHash);
        newPopulationSet.add(childHash);
        newPopulation.push(child);
      }
      newPopulationSet.add(parentHash);
      newPopulation.push(parent);
      parentCounter++;
      if (parentCounter === MAX_PARENT) break;
    }
    console.log(
      `Generate ${newPopulation.length} childs for next generation from ${parentCounter} parents`,
      `Population seen: ${populationSet.size}`
    );
    newPopulation.sort(() => Math.random() - 0.5);
    // Replace the old population with the new population
    population = newPopulation;
  }
};

const main = () => {
  // https://robotzzle.42.fr/js/lvl15.js
  // Solution => _frlb2_1g1__|_lbfrrrfblr2|____________, checkout it: http://www.robozzle.com/beta/index.html?puzzle=13847&program=Ogjndesam0PvwXyaaaaaaa
  const lvl_15_42 = {
    board: [
      "                    ",
      "                    ",
      " rgb       bbbbbbbb ",
      " rGb       bRRRRRRb ",
      " rGb       bRggggRb ",
      " rGb             Rb ",
      " rGb            RRb ",
      " rGbbbbb       RRbb ",
      " rGGGGGb      RRbb  ",
      " rrrrrGb     RRbb   ",
      "     rGb    RRbb    ",
      "     rGbbbbbrbrrrr  ",
      "     rrgggggbbbbbb  ",
      "                    ",
      "                    ",
    ],
    start: { x: 2, y: 2, a: 2 },
    allow_commands: "flr123_",
    allow_conds: "rgb_",
    functionSizes: [6, 6, 6],
  };

  // www.robozzle.com/js/play.aspx?puzzle=13721
  // Solution => bR_frrrGbr_1, checkout it: http://www.robozzle.com/beta/index.html?puzzle=13721&program=O2nsR6dcaaa
  const lvl_x = {
    board: [
      "                ",
      "                ",
      "                ",
      "                ",
      "rGgrgGgbR       ",
      "g  g   g        ",
      "g  g   g        ",
      "G  G   G        ",
      "G  G   G        ",
      "g  g   g        ",
      "g  g   g        ",
      "rGgrgGgb        ",
    ],
    start: { x: 3, y: 4, a: 1 },
    allow_commands: "flr1RG_",
    allow_conds: "rgb_",
    functionSizes: [6],
  };
  const config = { ...lvl_x, itemsToCollect: countItems(lvl_x) };
  // const config = { ...lvl_15_42, itemsToCollect: countItems(lvl_15_42) };
  // console.log(trySolution(config, [["br", "bR", "_f", "rr", "rG", "_1"]]));
  // console.log(trySolution(config, [["bR", "_f", "gl", "_r", "rG", "_1"]]));
  solver(config);
};

if (isMainThread) {
  main();
} else {
  // Receive data from main thread
  parentPort.on("message", (data) => {
    // Calculate fitness value
    const fitnessValue = fitness(data.config, data.program);

    // Send fitness value back to main thread
    parentPort.postMessage({ id: data.id, fitnessValue });
  });
}
