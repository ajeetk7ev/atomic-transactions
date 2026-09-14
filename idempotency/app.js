
const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());

const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "bank",
});

// ------------------------------------
// GET BALANCE
// ------------------------------------

app.get("/balance/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, name, balance
      FROM accounts
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Account not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Balance error:", error);

    res.status(500).json({
      message: "Database error",
    });
  }
});

// ------------------------------------
// WITHDRAW
// ------------------------------------

app.post("/withdraw/:id", async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  const idempotencyKey = req.headers["idempotency-key"];

  if (!idempotencyKey) {
    return res.status(400).json({
      message: "Idempotency-Key header is required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Check whether this request was already processed

    const existingWithdrawal = await client.query(
      `
      SELECT id, account_id, amount, created_at
      FROM withdrawals
      WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    if (existingWithdrawal.rows.length > 0) {
      await client.query("COMMIT");

      return res.status(200).json({
        message: "Request already processed",
        withdrawal: existingWithdrawal.rows[0],
      });
    }

    // 2. Lock account

    const accountResult = await client.query(
      `
      SELECT id, name, balance
      FROM accounts
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (accountResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Account not found",
      });
    }

    const account = accountResult.rows[0];

    // 3. Check balance

    if (account.balance < amount) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Insufficient balance",
      });
    }

    // 4. Withdraw money

    const updatedAccount = await client.query(
      `
      UPDATE accounts
      SET balance = balance - $1
      WHERE id = $2
      RETURNING id, name, balance
      `,
      [amount, id]
    );

    // 5. Record the withdrawal

    const withdrawal = await client.query(
      `
      INSERT INTO withdrawals (
        account_id,
        idempotency_key,
        amount
      )
      VALUES ($1, $2, $3)
      RETURNING id, account_id, amount, created_at
      `,
      [id, idempotencyKey, amount]
    );

    // 6. Commit everything together

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Withdrawal successful",
      account: updatedAccount.rows[0],
      withdrawal: withdrawal.rows[0],
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    return res.status(500).json({
      message: "Transaction failed",
    });

  } finally {
    client.release();
  }
});

// ------------------------------------
// START SERVER
// ------------------------------------

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

