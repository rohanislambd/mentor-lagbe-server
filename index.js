import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
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
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
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
// verifyTutor
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

// verifyAdmin
const verifyAdmin = async (req, res, next) => {
  const role = req.user.role;
  if (role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Only admins are allowed to perform this action.",
    });
  }
  next();
};

// verifyStudent
const verifyStudent = async (req, res, next) => {
  const role = req.user.role;
  if (role !== "student") {
    return res.status(403).json({
      success: false,
      message: "Only students are allowed to perform this action.",
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

// tuitions related api
app.post("/tuitions", verifyToken, verifyTutor, async (req, res) => {
    const tuition = req.body;
    const userPlan = req.user.plan || "free";

    if (userPlan === "free") {
        const tuitionCount = await tuitionsCollection.countDocuments({
            tutorEmail: req.user.email
        });

        if (tuitionCount >= 2) {
            return res.status(403).send({
                success: false,
                message: "Free plan limit reached (Max 2 tuitions). Upgrade to Pro!",
            });
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

    const result = await tuitionsCollection.insertOne({
        ...tuition,
        createdAt: new Date(),
    });

    res.status(201).json({
        success: true,
        message: "Tuition created successfully!",
        result,
    });
});


// tutor get api
app.get("/tuitions/my-tuitions", verifyToken, verifyTutor, async (req, res) => {
  const result = await tuitionsCollection
    .find({ tutorEmail: req.user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

 // Single Tuition Details
 app.get("/tuitions/:id", async(req, res) => {
     const id = req.params.id
     const query = {_id: new ObjectId(id)};
     const result = await tuitionsCollection.findOne(query)
     res.send(result)
 })

 // Tuition patch api
app.patch("/tuitions/:id",verifyToken,verifyTutor, async(req, res) => {
  const id = req.params.id;
  const updateTuition = req.body;
  delete updateTuition._id;

  const result = await tuitionsCollection.updateOne(
    {_id: new ObjectId(id), tutorEmail: req.user.email},
    { $set: updateTuition }
  )
  res.send(result)
})


// Tuition delete api
app.delete("/tuitions/:id",verifyToken, verifyTutor,  async(req,res) => {
  const id = req.params.id;
  const result = await tuitionsCollection.deleteOne({
    _id: new ObjectId(id),
    tutorEmail: req.user.email
  })
  res.send(result)
})


//
// Admin api to get all tuitions
app.get("/admin/tuitions", verifyToken, verifyAdmin, async (req, res) => {
  const result = await tuitionsCollection
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

//  Tuition approvalStatus approve admin api
app.patch("/alltuitions/:id/approve", verifyToken, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const { approvalStatus } = req.body;
  // console.log(approvalStatus);
  const result = await tuitionsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { approvalStatus } }
  );
  res.send(result);
});



// publice browse tuitions api ---> server side search, filter, pagination
app.get("/tuitions", async (req, res) => {
  const query = {
    approvalStatus: "approved",
    isActive: true,
  }
  if(req.query.subject){
    query.subject = {
      $regex: req.query.subject,
      $options: "i"
    };
  }

  if(req.query.classLevel){
    query.classLevel = {
      $regex: req.query.classLevel,
      $options: "i"
    }
  }
    if (req.query.mode) {
    query.mode = {
      $regex: `^${req.query.mode}$`,
      $options: "i",
    };
  }
  if(req.query.tutorName){
    query.tutorName = {
      $regex: req.query.tutorName,
      $options: "i"
    }
  }

  //Search filter (Title or subject)

  if(req.query.search){
    query.$or=[
      {title: {$regex: req.query.search, $options: "i"}},
      {subject: {$regex: req.query.search, $options: "i"}}, 
      {tutorName: {$regex: req.query.search, $options: "i"}}
    ]
  }


  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const skip = (page - 1) * limit;

  const total = await tuitionsCollection.countDocuments(query);
  const result = await tuitionsCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
  res.send({
    result,
    total,
    totalPages: Math.ceil(total / limit),
  });
})




app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
