
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

  // Get one dedicated connection from the pool
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query("BEGIN");

    console.log(`Transaction started for account ${id}`);

    // ------------------------------------
    // LOCK THE ACCOUNT ROW
    // ------------------------------------

    const result = await client.query(
      `
      SELECT id, name, balance
      FROM accounts
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Account not found",
      });
    }

    const account = result.rows[0];

    console.log(
      `Account ${account.id} locked. Current balance: ${account.balance}`
    );

    // ------------------------------------
    // VALIDATE AMOUNT
    // ------------------------------------

    if (!amount || amount <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Amount must be greater than 0",
      });
    }

    // ------------------------------------
    // CHECK BALANCE
    // ------------------------------------

    if (account.balance < amount) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "Insufficient balance",
      });
    }

    // ------------------------------------
    // UPDATE BALANCE
    // ------------------------------------

    const updatedAccount = await client.query(
      `
      UPDATE accounts
      SET balance = balance - $1
      WHERE id = $2
      RETURNING id, name, balance
      `,
      [amount, id]
    );

    console.log(
      `Balance updated: ${updatedAccount.rows[0].balance}`
    );

    // ------------------------------------
    // COMMIT TRANSACTION
    // ------------------------------------
    await new Promise((resolve) => {
        setTimeout(() => {
          resolve("Promise is resolved")
        },20000)
    });

    throw new Error("This is an error")
    await client.query("COMMIT");

    console.log(`Transaction committed for account ${id}`);

    res.json({
      message: "Withdrawal successful",
      account: updatedAccount.rows[0],
    });
  } catch (error) {
    // ------------------------------------
    // ROLLBACK ON ERROR
    // ------------------------------------

    await client.query("ROLLBACK");

    console.error("Withdraw error:", error);

    res.status(500).json({
      message: "Transaction failed",
    });
  } finally {
    // ------------------------------------
    // RETURN CONNECTION TO POOL
    // ------------------------------------

    client.release();

    console.log("Database connection released");
  }
});

// ------------------------------------
// START SERVER
// ------------------------------------

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

