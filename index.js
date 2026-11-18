import express from 'express';
import cors from 'cors';
import 'dotenv/config'
import { MongoClient } from 'mongodb';

const app = express();
const PORT = process.env.PORT || 5000;

// middleware  
app.use(cors());
app.use(express.json());

//mongodb database

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const db = connectedClient.db('mentor-lagbe');
const usersCollection = db.collection('user');
const tuitionsCollection = db.collection('tuitions');
const applicationsCollection = db.collection('applications');
const paymentsCollection = db.collection('payments');


app.get('/', (req, res) => {
  res.send({success: true, message: "mentor-lab backend is running"});
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});``