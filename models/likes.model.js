'use strict'

const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;

const LikeSchema = Schema({
  interactors: [{ type: Schema.Types.ObjectId, ref: 'user' }],
  likes: { type: Number, default: 0 },
});

module.exports = Mongoose.model('like',LikeSchema);
