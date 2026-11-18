import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// Auth Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({success: false, message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({success: false, message: "Unauthorized access" });
  }

  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
  );

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch {
    return res.status(401).send({
        success: false,
      message: "Unauthorized access",
    });
  }
};
//must call this middleware after veriifyToken
const verifyTutor = async (req, res, next) => {
  const role = req.user.role;
  if (role !== "tutor") {
    return res.status(403).json({
      success: false,
      message: "Only tutors are allowed to perform this action.",
    });
  }
  next();
};

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
const db = connectedClient.db("mentor-lagbe");
const usersCollection = db.collection("user");
const tuitionsCollection = db.collection("tuitions");
const applicationsCollection = db.collection("applications");
const paymentsCollection = db.collection("payments");

app.get("/", (req, res) => {
  res.send({ success: true, message: "mentor-lab backend is running" });
});

// tuitions releted api
app.post("/tuitions", verifyToken, verifyTutor, async (req, res) => {
  const tuition = req.body;
  const userPlan = req.user.plan || "free";

  if(userPlan === "free"){
    const tuitionCount = await tuitionsCollection.countDocuments({
        tutorEmail: req.user.email
    });
    if(tuitionCount => 2){
        return res.status(403).send({
        success: false,
        message: "Free plan limit reached (Max 2 tuitions). Upgrade to Pro!",
        })
    }
  }

  const existingTuition = await tuitionsCollection.findOne({
    title: tuition.title,
    tutorEmail: req.user.email,
  });

  if (existingTuition) {
    return res.status(409).json({
      success: false,
      message: "This tuition already exists!",
    });
  }

  const result = await tuitionsCollection.insertOne(tuition);

  res.status(201).json({
    success: true,
    message: "Tuition created successfully!",
    result,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
``;
