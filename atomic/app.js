import express from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

// 1. Schema Definition
const productSchema = new mongoose.Schema({
  name: String,
  stock: Number,
});
const Product = mongoose.model('Product', productSchema);

// 2. The Route Handler
app.post('/purchase', async (req, res) => {
  const { productId, quantity } = req.body;

  try {
    // Atomically find the item AND check if there is enough stock before decrementing
    const updatedProduct = await Product.findOneAndUpdate(
      { 
        _id: productId, 
        stock: { $gte: quantity } // Condition: prevents stock from going below 0
      },
      { 
        $inc: { stock: -quantity } // Action: atomically decrements stock
      },
      { 
        new: true // Option: returns the newly updated document
      }
    );

    // If no document matched, it means the product doesn't exist OR stock was insufficient
    if (!updatedProduct) {
      return res.status(400).json({ error: "Item out of stock or not found" });
    }

    return res.status(200).json({ message: "Purchase successful", updatedProduct });
    
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
});


app.listen(8000, () =>{
    console.log("Server is running at port 8000")
})