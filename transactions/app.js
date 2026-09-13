import express from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

// 1. Schema Definition
const accountSchema = new mongoose.Schema({
  userId: String,
  balance: Number,
});
const Account = mongoose.model('Account', accountSchema);

// 2. The Route Handler
app.post('/transfer', async (req, res) => {
  const { senderId, receiverId, amount } = req.body;

  // Start the Mongoose session for the transaction
  const session = await mongoose.startSession();
  
  try {
    // Begin the transaction block
    session.startTransaction();

    // Step A: Deduct money from the sender (and verify they have enough funds)
    const sender = await Account.findOneAndUpdate(
      { userId: senderId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session } // Crucial: pass the session context
    );

    if (!sender) {
      // Throwing an error automatically triggers the catch block to abort the transaction
      throw new Error("Insufficient funds or sender account not found");
    }

    // Step B: Add money to the receiver
    const receiver = await Account.findOneAndUpdate(
      { userId: receiverId },
      { $inc: { balance: amount } },
      { new: true, session } // Crucial: pass the session context
    );

    if (!receiver) {
      throw new Error("Receiver account not found");
    }

    // If both steps succeed, commit the changes permanently to the database
    await session.commitTransaction();
    return res.status(200).json({ message: "Transfer successful!" });

  } catch (error) {
    // If anything goes wrong during Steps A or B, cancel all operations in this block
    await session.abortTransaction();
    return res.status(400).json({ error: error.message });

  } finally {
    // Always clean up and close the session execution window
    session.endSession();
  }
});

app.listen(8001, () =>{
    console.log("Server is running at port 8000")
})
