import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// Auth Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res
      .status(401)
      .send({ success: false, message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .send({ success: false, message: "Unauthorized access" });
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

const user = await usersCollection.findOne({
    email: req.user.email,
})
if (!user) {
  return res.status(404).send({
    success: false,
    message: "User not found",
  });
}


const userPlan = user.plan;

  if (userPlan === "free") {
    const tuitionCount = await tuitionsCollection.countDocuments({
      tutorEmail: req.user.email,
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
app.get("/tuitions/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await tuitionsCollection.findOne(query);
  res.send(result);
});

// Tuition patch api
app.patch("/tuitions/:id", verifyToken, verifyTutor, async (req, res) => {
  const id = req.params.id;
  const updateTuition = req.body;
  delete updateTuition._id;

  const result = await tuitionsCollection.updateOne(
    { _id: new ObjectId(id), tutorEmail: req.user.email },
    { $set: updateTuition },
  );
  res.send(result);
});

// Tuition delete api
app.delete("/tuitions/:id", verifyToken, verifyTutor, async (req, res) => {
  const id = req.params.id;
  const result = await tuitionsCollection.deleteOne({
    _id: new ObjectId(id),
    tutorEmail: req.user.email,
  });
  res.send(result);
});

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
app.patch(
  "/alltuitions/:id/approve",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const id = req.params.id;
    const { approvalStatus } = req.body;
   
    const result = await tuitionsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus } },
    );
    res.send(result);
  },
);

// publice browse tuitions api ---> server side search, filter, pagination
app.get("/tuitions", async (req, res) => {
  const query = {
    approvalStatus: "approved",
    isActive: true,
  };
  if (req.query.subject) {
    query.subject = {
      $regex: req.query.subject,
      $options: "i",
    };
  }

  if (req.query.classLevel) {
    query.classLevel = {
      $regex: req.query.classLevel,
      $options: "i",
    };
  }
  if (req.query.mode) {
    query.mode = {
      $regex: `^${req.query.mode}$`,
      $options: "i",
    };
  }
  if (req.query.tutorName) {
    query.tutorName = {
      $regex: req.query.tutorName,
      $options: "i",
    };
  }

  //Search filter (Title or subject)

  if (req.query.search) {
    query.$or = [
      { title: { $regex: req.query.search, $options: "i" } },
      { subject: { $regex: req.query.search, $options: "i" } },
      { tutorName: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const skip = (page - 1) * limit;

  const total = await tuitionsCollection.countDocuments(query);
  const result = await tuitionsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  res.send({
    result,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// tutor application accept or reject
app.patch("/applications/:id", verifyToken, verifyTutor, async (req, res) => {
  const id = req.params.id;

  const existing = await applicationsCollection.findOne({
    _id: new ObjectId(id),
    tutorEmail: req.user.email,
  });

  if (!existing) {
    return res
      .status(404)
      .send({ success: false, message: "Application not found" });
  }

  if (existing.status !== "pending") {
    return res.status(400).send({
      success: false,
      message: `This application has already been ${existing.status} and cannot be modified again.`,
    });
  }

  const query = {
    _id: new ObjectId(id),
    tutorEmail: req.user.email,
    status: "pending",
  };
  const updateDoc = {
    $set: {
      status: req.body.status,
    },
  };
  const result = await applicationsCollection.updateOne(query, updateDoc);
  res.send(result);
});

// student related api
//studen application post api
app.post("/applications", verifyToken, verifyStudent, async (req, res) => {
  const applicationData = req.body;

  const existing = await applicationsCollection.findOne({
    tuitionId: applicationData.tuitionId,
    studentEmail: req.user.email,
  });

  if (existing) {
    return res.status(400).send({
      success: false,
      message: "You have already applied for this tuition!",
    });
  }

  const applications = {
    ...applicationData,
    appliedAt: new Date(),
  };
  const result = await applicationsCollection.insertOne(applications);
  res.send(result);
});

// Student & Tutor Applications View
app.get("/applications", verifyToken, async (req, res) => {
  const query = {};
  if (req.user.role === "student") {
    query.studentEmail = req.user.email;
  } else if (req.user.role === "tutor") {
    query.tutorEmail = req.user.email;
  }
  const result = await applicationsCollection
    .find(query)
    .sort({ appliedAt: -1 })
    .toArray();
  res.send(result);
});

// Student my-applications API
app.get("/applications/my-applications", verifyToken, async (req, res) => {
  const result = await applicationsCollection
    .find({ studentEmail: req.user.email })
    .sort({ appliedAt: -1 })
    .toArray();
  res.send(result);
});

// Student cancel/delete pending application
app.delete(
  "/applications/:id",
  verifyToken,
  verifyStudent,
  async (req, res) => {
    const id = req.params.id;
    const result = await applicationsCollection.deleteOne({
      _id: new ObjectId(id),
      studentEmail: req.user.email,
      status: "pending",
    });
    res.send(result);
  },
);

// user related api
// all users get api for admin
app.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  const result = await usersCollection.find({}).toArray();
  res.send(result);
});

// user role update api for admin
app.patch(
  "/admin/users/:id/role",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const id = req.params.id;

    const query = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        role: req.body.role,
      },
    };
    const result = await usersCollection.updateOne(query, updateDoc);
    res.send(result);
  },
);

// get logged in user info
app.get("/users/me", verifyToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({
      email: req.user.email,
    });

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
      });
    }

    res.send(user);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to fetch user",
    });
  }
});

// update profile (student, tutor, admin) api
app.patch("/users/profile", verifyToken, async (req, res) => {
  const { name, phone, bio, image } = req.body;
  const updateDoc = {
    $set: {
      name,
      phone,
      bio,
      image,
    },
  };
  const result = await usersCollection.updateOne(
    { email: req.user.email },
    updateDoc,
  );
  res.send(result);
});

// payment related api

// stripe checkout session create api
app.post("/payments/create-checkout-session", verifyToken, async (req, res) => {
  const { targetPlan } = req.body || {};
  if (targetPlan && targetPlan !== req.user.role) {
    return res.status(400).send({
      success: false,
      message: `Role mismatch: As a ${req.user.role}, you cannot purchase the ${targetPlan} plan.`,
    });
  }

  const amount = req.user.role === "tutor" ? 1500 : 1000;
  const planName =
    req.user.role === "tutor" ? "Pro Tutor Plan" : "Pro Student Plan";


  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `MentorLagbe - ${planName}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: req.user.id,
      userEmail: req.user.email,
      userName: req.user.name,
      userRole: req.user.role,
      planName,
    },
    success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
  });

  res.send({ url: session.url });
});

//  stripe checkout verify end

app.post("/payments/checkout-verify", verifyToken, async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res
      .status(400)
      .send({ success: false, message: "Session ID is required" });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const {
    status,
    customer_email,
    metadata,
    payment_intent,
    payment_status,
    amount_total,
    currency,
  } = session;

  if (status === "complete" && payment_status === "paid") {
    const existingPayment = await paymentsCollection.findOne({
      stripeSessionId: sessionId,
    });
    if (existingPayment) {
      return res.send({
        success: true,
        alreadyVerified: true,
        payment: existingPayment,
        message: "Payment already verified",
      });
    }

    const payment = {
      userEmail: customer_email || metadata.userEmail,
      userName: metadata.userName,
      userRole: metadata.userRole,
      planName: metadata.planName,
      amount: amount_total / 100,
      currency: currency || "usd",
      transactionId: payment_intent,
      stripeSessionId: sessionId,
      paymentStatus: "paid",
      paidAt: new Date(),
    };

    const result = await paymentsCollection.insertOne(payment);

    // user collectins plan update

    let userQuery = { email: customer_email || metadata.userEmail };
    if (metadata.userId) {
      try {
        userQuery = {
          $or: [
            { _id: new ObjectId(metadata.userId) },
            { email: customer_email || metadata.userEmail },
          ],
        };
      } catch {
        userQuery = { email: customer_email || metadata.userEmail };
      }
    }

    const updateResult = await usersCollection.updateOne(userQuery, {
      $set: {
        plan: "pro",
      },
    });

    res.send({ success: true, payment, result, updateResult });
    return;
  }

  res.send({ success: false, message: "Payment verification failed" });
});

// Admin: View All Payment History
app.get("/payments", verifyToken, verifyAdmin, async(req, res) => {
  const result = await paymentsCollection.find({}).sort({paidAt: -1 }).toArray()
  res.send(result)
})

// admin overview Stats
app.get("/admin/stats", verifyToken, verifyAdmin, async(req, res)=> {
  const totalUsers = await usersCollection.countDocuments();
  const totalTutors = await usersCollection.countDocuments({role: "tutor"});
  const totalStudents = await usersCollection.countDocuments({role: "student"});
  const pendingTuitions = await tuitionsCollection.countDocuments({ approvalStatus: "pending"});
  const approvedTuitions = await  tuitionsCollection.countDocuments({
    approvalStatus: "approved"
  });

  const paidPayments = await  paymentsCollection.find({ paymentStatus: "paid" }).toArray();

  const totalRevenue = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0)

  res.send({
    totalUsers,
    totalTutors,
    totalStudents,
    pendingTuitions,
    approvedTuitions,
    totalRevenue,
  });


})

// total tutor and student count
app.get("/home/totaluser",verifyToken, async(req, res) => {
  const totalTutors = await usersCollection.countDocuments({role: "tutor"});
  const totalStudents = await usersCollection.countDocuments({role: "student"});
  res.send({
    totalTutors,
    totalStudents
  })
})


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


export default app;