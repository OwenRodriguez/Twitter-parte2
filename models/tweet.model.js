"use strict";

const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const TweetSchema = Schema({
  date: Date,
  likes: { type: Schema.Types.ObjectId, ref: "like" },
  creator: [{ type: Schema.Types.ObjectId, ref: "user" }],
  replies: [{ type: Schema.Types.ObjectId, ref: "reply" }],
  content: String,
});

module.exports = Mongoose.model("tweet", TweetSchema);
