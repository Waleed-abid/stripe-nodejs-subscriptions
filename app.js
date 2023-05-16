const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const app = express();
require("dotenv").config();
const Publishable_Key = process.env.Publishable_Key;
const Secret_Key = process.env.Secret_Key;
console.log(Publishable_Key, Secret_Key);
const stripe = require("stripe")(Secret_Key);

const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "your-secret-key",
    resave: true,
    saveUninitialized: true,
  })
);

// View Engine Setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const getProducts = async () => {
  try {
    const products = await stripe.products.list();
    return products.data; // Array of product objects
  } catch (error) {
    console.error(error);
    return [];
  }
};

app.get("/", async (req, res) => {
  try {
    const products = await getProducts();

    // Create a map of product IDs to their respective prices
    const productPriceMap = {};
    for (const product of products) {
      const prices = await stripe.prices.list({ product: product.id });
      if (prices.data.length > 0) {
        productPriceMap[product.id] = prices.data[0].unit_amount;
      }
    }

    res.render("products", {
      key: Publishable_Key,
      products,
      productPriceMap,
    });
  } catch (error) {
    console.error(error);
    res.send("Error retrieving products");
  }
});

// Create a checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { product_id } = req.body;
  try {
    const product = await stripe.products.retrieve(product_id);

    // Retrieve prices for the product
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

    if (prices.data.length === 0) {
      throw new Error("No active prices found for the product");
    }
    const price = prices.data[0]; // Assuming you want to use the first price found

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
    });
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/success", (req, res) => {
  res.send("Success!");
});
app.get("/cancel", (req, res) => {
  res.send("cancelled!");
});
// Handle the Stripe webhook endpoint to receive events
app.post("/stripe-webhook", async (req, res) => {
  const payload = req.body;
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error(err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event based on its type
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Retrieve the session details and store them in your database or perform any other required actions
    // You can access information such as session ID, customer details, subscription details, etc.
    const sessionId = session.id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Store the information in your database or perform any other desired actions
    // ...

    res.sendStatus(200);
  } else {
    // Handle other event types if needed
    res.sendStatus(200);
  }
});

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Server listening on ${port}`);
});
