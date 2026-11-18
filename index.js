import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const app = express();
const PORT = process.env.PORT || 5000;

// middleware  
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send({success: true, message: "mentor-lab backend is running"});
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});``