const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const app = express();

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World! From ToolsPlaza.");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.vxlwg.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// middletear
function verifyJWT(req, res, next) {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db("toolsplazadb").collection("tools");
    const ordersCollection = client.db("toolsplazadb").collection("orders");
    const paymentCollection = client.db("toolsplazadb").collection("payments");
    const reviewCollection = client.db("toolsplazadb").collection("reviews");
    const userInfoCollection = client.db("toolsplazadb").collection("userinfo");
    const usersCollection = client.db("toolsplazadb").collection("users");

    //creating tools api
    app.post("/tools", verifyJWT, async (req, res) => {
      const tool = req.body;
      const result = await toolsCollection.insertOne(tool);
      res.send(result);
    });

    // geting all tools
    app.get("/tools", async (req, res) => {
      const query = {};
      const cursor = toolsCollection.find(query);
      const result = (await cursor.toArray()).reverse();
      res.send(result);
    });

    // geting all users
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    //get admins api
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //geting users
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      var token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ result, token });
    });

    //making admin api
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden Access." });
      }
    });

    // stripe payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const product = req.body;
      const price = product.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // stripe payment intent end

    // geting tools by id (for purchasing single tools)
    app.get("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tool = await toolsCollection.findOne(query);
      res.send(tool);
    });

    //posting what user orders on mongodb
    app.post("/orders", async (req, res) => {
      const orders = req.body;
      // console.log(orders);
      const result = await ordersCollection.insertOne(orders);
      return res.send(result);
    });

    //posting user review to database
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      console.log(review);
      const result = await reviewCollection.insertOne(review);
      return res.send(result);
    });

    // geting all reviews
    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // deleting orders by id
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    //geting specific data from orders using email params
    app.get("/orders/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req?.decoded?.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const orders = (await ordersCollection.find(query).toArray()).reverse();
        return res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden Access." });
      }
    });

    // geting orders collection for specific user ordered id for payment
    app.get("/orders/order/:id", async (req, res) => {
      const id = req?.params?.id;
      // console.log("Hello Id- ", id);
      const query = { _id: ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      res.send(order);
    });

    //updating data after successfully stripe card payment
    app.patch("/orders/order/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedOrders = await ordersCollection.updateOne(
        filter,
        updatedDoc
      );

      res.send(updatedDoc);
    });

    //updating user information data to the database
    app.put("/userinfo/:email", async (req, res) => {
      const email = req.params.email;
      const userinfo = req.body;
      console.log(userinfo);
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: userinfo,
      };
      const result = await userInfoCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //geting specific user information from userinfocollection using email params
    app.get("/userinfo/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userInfoCollection.findOne(query);
      res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`ToolsPlaza app listening on port`, port);
});
