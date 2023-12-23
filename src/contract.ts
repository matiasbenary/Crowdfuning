// Find all our documentation at https://docs.near.org
import {
  NearBindgen,
  call,
  view,
  AccountId,
  ONE_NEAR,
  near,
  initialize,
  Vector,
  UnorderedMap,
  assert,
  NearPromise,
} from "near-sdk-js";
import { STORAGE_COST } from "./model";

@NearBindgen({ requireInit: true })
class Crowdfunding {
  goal: bigint = BigInt(0);
  total: bigint = BigInt(0);
  contributions: UnorderedMap<bigint> = new UnorderedMap<bigint>("c");
  owner_id: AccountId = "";
  end_date: bigint = BigInt(0);

  @initialize({ privateFunction: true })
  init({ goal, owner_id, end_date }) {
    this.goal = goal;
    this.owner_id = owner_id;
    this.end_date = end_date;
  }

  @call({ payableFunction: true })
  pledge(): void {
    assert( near.blockTimestamp() < this.end_date , "The project is over");
    const contributor = near.predecessorAccountId();
    let deposit = near.attachedDeposit();
    
    const contributed = this.contributions.get(contributor, {
      defaultValue: BigInt(0),
    });
  
    if(contributed <= BigInt(0)){
      assert(deposit > STORAGE_COST,`Attach at least ${STORAGE_COST} yoctoNEAR`)
      deposit-= STORAGE_COST;
    }

    this.total += deposit;
    this.contributions.set(contributor, contributed + deposit);
  }

  @call({})
  claim_funds(): void {
    assert(
      near.predecessorAccountId() == this.owner_id,
      "Only owner can claim the funding"
    );
    assert(near.blockTimestamp() > this.end_date, "The project is not over");
    assert(this.total >= this.goal, "I don't reach the goal to claim");

    NearPromise.new(this.owner_id).transfer(this.total);
    this.total = BigInt(0);
  }

  @call({})
  reclaim(): void {
    assert(near.blockTimestamp() > this.end_date, "The project is not over");
    assert(this.total < this.goal, "The goal has been reached");

    const contributor = near.predecessorAccountId();
    const amount = this.contributions.get(contributor, {
      defaultValue: BigInt(0),
    });

    assert(amount > BigInt(0), "There are no funds to claim");

    NearPromise.new(contributor).transfer(amount+STORAGE_COST);
    this.contributions.remove(contributor);
  }

  @view({})
  get_total(): bigint {
    return this.total;
  }

  @view({})
  get_goal(): bigint {
    return this.goal;
  }

  @view({})
  get_contributions() {
    return this.contributions.toArray();
  }

  @view({})
  is_funded(): boolean {
    return this.total >= this.goal;
  }
}
