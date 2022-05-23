const express = require("express");
const cors = require("cors");
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

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db("toolsplazadb").collection("tools");
    const ordersCollection = client.db("toolsplazadb").collection("orders");
    const paymentCollection = client.db("toolsplazadb").collection("payments");

    // geting all tools
    app.get("/tools", async (req, res) => {
      const query = {};
      const cursor = toolsCollection.find(query);
      const result = (await cursor.toArray()).reverse();
      res.send(result);
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

    // geting tools by id
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

    //geting specific data from orders using email params
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const orders = (await ordersCollection.find(query).toArray()).reverse();
      res.send(orders);
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
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`ToolsPlaza app listening on port`, port);
});
