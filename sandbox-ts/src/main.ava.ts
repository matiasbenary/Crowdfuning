import { Worker, NearAccount, NEAR } from "near-workspaces";
import anyTest, { TestFn } from "ava";

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

export const STORAGE_COST: bigint = BigInt("240000000000000000000");

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const DEFAULT_DELAY = 10000;

test.beforeEach(async (t) => {
  // Init the worker and start a Sandbox server
  const worker = await Worker.init();
  // Deploy contract
  const root = worker.rootAccount;

  const owner = await root.createSubAccount("owner", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  const alice = await root.createSubAccount("alice", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  const bob = await root.createSubAccount("bob", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  //537,1kb contract -> 5,271 near
  //5.283
  const contract = await root.createSubAccount("contract", {
    initialBalance: NEAR.parse("5.283 N").toJSON(),
  });

  let balance = await contract.balance();
  let available = balance.available.toHuman();
  console.log("init", available);

  // Get wasm file path from package.json test script in folder above
  await contract.deploy(process.argv[2]);
  // await contract.deploy(process.argv[2]);
  balance = await contract.balance();
  available = balance.available.toHuman();
  console.log("deploy", available);

  // Initialize beneficiary
  const goal = NEAR.parse("9 N").toString();
  const end_date = (Date.now() + DEFAULT_DELAY) * 10 ** 6
  // console.log(end_date);
  await contract.call(contract, "init", {
    goal,
    owner_id: owner.accountId,
    end_date,
  });

  balance = await contract.balance();
  available = balance.available.toHuman();
  console.log("call init", available);

  // Save state for test runs, it is unique for each test
  t.context.worker = worker;
  t.context.accounts = { root, contract, owner, alice, bob };
});

test.afterEach.always(async (t) => {
  // Stop Sandbox server
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to stop the Sandbox:", error);
  });
});

test("Alicia makes her first pledge", async (t) => {
  const { alice, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  const response = await contract.view("get_contributions");

  const expectedResponse = [
    [alice.accountId, (NEAR.parse("1 N").toBigInt() - STORAGE_COST).toString()],
  ];

  t.deepEqual(response, expectedResponse);

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);
});

test("Bob makes her first contribution", async (t) => {
  const { alice, bob, contract } = t.context.accounts;
  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );
  await bob.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  const response = await contract.view("get_contributions");

  const expectedResponse = [
    [alice.accountId, (NEAR.parse("1 N").toBigInt() - STORAGE_COST).toString()],
    [bob.accountId, (NEAR.parse("1 N").toBigInt() - STORAGE_COST).toString()],
  ];

  t.deepEqual(response, expectedResponse);

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);
});

test("Alice makes her second contribution", async (t) => {
  const { alice, bob, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  await bob.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  const response = await contract.view("get_contributions");
  const expectedResponse = [
    [alice.accountId, (NEAR.parse("2 N").toBigInt() - STORAGE_COST).toString()],
    [bob.accountId, (NEAR.parse("1 N").toBigInt() - STORAGE_COST).toString()],
  ];

  t.deepEqual(response, expectedResponse);

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);
});

test("Goal is reached", async (t) => {
  const { alice, bob, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  await bob.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("9 N").toString() }
  );

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("1 N").toString() }
  );

  const response = await contract.view("get_contributions");

  const expectedResponse = [
    [alice.accountId, (NEAR.parse("2 N").toBigInt() - STORAGE_COST).toString()],
    [bob.accountId, (NEAR.parse("9 N").toBigInt() - STORAGE_COST).toString()],
  ];

  t.deepEqual(response, expectedResponse);

  const isFunded: boolean = await contract.view("is_funded");
  t.is(true, isFunded);
});

test("Funding is claimed", async (t) => {
  const { alice, owner, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("11 N").toString() }
  );

  const isFunded: boolean = await contract.view("is_funded");
  t.is(true, isFunded);

  const balance = await owner.balance();
  const available = balance.available.toBigInt();
 
  await delay(DEFAULT_DELAY);

  await owner.call(contract, "claim_funds", {});

  const new_balance = await owner.balance();
  const new_available =
    new_balance.available.toHuman() ;

  const expected = NEAR.from((available+NEAR.parse("11 N").toBigInt() - STORAGE_COST).toString()).toHuman();

  t.true(Math.abs(parseFloat(expected) - parseFloat(new_available)) < 0.1);
});

test("Alice claims the funds", async (t) => {
  const { alice, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("11 N").toString() }
  );
  await delay(DEFAULT_DELAY);

  const isFunded: boolean = await contract.view("is_funded");
  t.is(true, isFunded);

  await t.throwsAsync(async () => {
    await alice.call(contract, "claim_funding", {});
  });
});

test("Alice reclaims the deposit", async (t) => {
  const { alice, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("2 N").toString() }
  );

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);
  await delay(DEFAULT_DELAY);

  await alice.call(contract, "reclaim", {});

  const response = await contract.view("get_contributions");

  const expectedResponse = [];

  t.deepEqual(response, expectedResponse);
});

test("Alice claims the deposit twice in a row", async (t) => {
  const { alice, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("2 N").toString() }
  );

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);
  await delay(DEFAULT_DELAY);

  await alice.call(contract, "reclaim", {});

  const response = await contract.view("get_contributions");

  const expectedResponse = [];

  t.deepEqual(response, expectedResponse);

  await t.throwsAsync(async () => {
    await alice.call(contract, "reclaim", {});
  });
});

test("Funding is claimed,but I did not reach the goal.", async (t) => {
  const { alice, owner, contract } = t.context.accounts;

  await alice.call(
    contract,
    "pledge",
    {},
    { attachedDeposit: NEAR.parse("2 N").toString() }
  );

  const isFunded: boolean = await contract.view("is_funded");
  t.is(false, isFunded);

  await t.throwsAsync(async () => {
    await owner.call(contract, "claim_funding", {});
  });
});
