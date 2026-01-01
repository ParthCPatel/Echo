const { MongoClient } = require("mongodb");

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);
const dbName = "echo";

let db = null;

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB server");
    db = client.db(dbName);
    return true;
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    return false;
  }
}

async function saveTranscript(data, notes = "") {
  if (!db) {
    console.warn("Database not connected. Skipping save.");
    return false;
  }

  try {
    const collection = db.collection("transcripts");
    const document = {
      timestamp: new Date(),
      notes: notes,
      data: data, // The full Deepgram response (diarization or text)
    };

    const result = await collection.insertOne(document);
    console.log(`Transcript saved with _id: ${result.insertedId}`);
    return true;
  } catch (error) {
    console.error("Failed to save transcript:", error);
    return false;
  }
}

module.exports = { connectDB, saveTranscript };
