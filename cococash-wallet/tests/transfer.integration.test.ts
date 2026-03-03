import request from "supertest";
import app from "../src/app";
import { pool } from "../src/config/db";

describe("Transfer Integration", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM transfers");
    await pool.query("DELETE FROM accounts");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should transfer money between accounts", async () => {
    const acc1 = await request(app)
      .post("/v1/accounts")
      .send({ userId: "11111111-1111-1111-1111-111111111111", initialBalance: 1000 });

    const acc2 = await request(app)
      .post("/v1/accounts")
      .send({ userId: "22222222-2222-2222-2222-222222222222", initialBalance: 500 });

    const transfer = await request(app)
      .post("/v1/transfers")
      .send({
        sourceAccountId: acc1.body.id,
        destinationAccountId: acc2.body.id,
        amount: 200
      });

    expect(transfer.status).toBe(202);
    expect(transfer.body.status).toBe("COMPLETED");
  });
});