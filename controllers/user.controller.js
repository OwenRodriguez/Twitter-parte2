"use strict";

const bcrypt = require("bcrypt");
const User = require("../models/user.model");
const Tweet = require("../models/tweet.model");
const Like = require("../models/likes.model");
const Reply = require("../models/reply.model");
const Retweet = require("../models/retweet.model");
const jwt = require("../services/jwt");
const { getAction } = require("twitter-command");

const commands = async (req, res) => {
  try {
    res.send(await actions(req.user, getAction(req)));
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: "Error in the server" });
  }
};

const register = async (args) => {
  const user = User();
  try {
    let userExists = await User.findOne({
      $or: [{ email: args[1] }, { username: args[2] }],
    });
    if (userExists) return { message: "Usuario existente" };
    else {
      user.name = args[0];
      user.email = args[1];
      user.username = args[2];
      const password = await pass(args[3]);
      if (!password) return { message: "No se pudo almacenar la contraseña" };
      else {
        user.password = password;
        let accountCreated = await user.save();
        if (!accountCreated) return { message: "No se pudo crear la cuenta" };
        else {
          return accountCreated;
        }
      }
    }
  } catch (err) {
    return { message: "Error in the server" };
  }
};

const pass = async (password) => {
  return await new Promise((res, rej) => {
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) rej(err);
      res(hash);
    });
  });
};

const login = async (args) => {
  try {
    const userFound = await User.findOne({
      $or: [{ username: args[0] }, { email: args[0] }],
    });

    if (!userFound) return { message: "Email o usuarios son erroneos" };
    else {
      const correctPassword = await bcrypt.compare(args[1], userFound.password);
      if (!correctPassword) return { message: "Contraseña invalida" };
      else {
        return { token: jwt.createToken(userFound) };
      }
    }
  } catch (err) {
    return { message: "Error in the server" };
  }
};

const createTweet = async (user, args) => {
  try {
    let newTweet = new Tweet();
    let like = new Like();
    newTweet.creator = user.sub;
    newTweet.date = new Date();
    newTweet.content = args[0];

    const reactionSaved = await like.save();
    if (!reactionSaved) {
      return {
        message: "No se pudieron dar likes",
      };
    } else {
      newTweet.likes = reactionSaved._id;
      const newTweetAdded = await (await newTweet.save())
        .populate("creator", "-password -following -followers -name -email")
        .populate("likes", "-_id -interactors")
        .execPopulate();
      if (!newTweetAdded) return { message: "No se pudo agregar el tweet" };
      else {
        return newTweetAdded;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};



const editNDelete = async (user, args, operation) => {
  try {
    let resultTweet;
    let tweetFound;
    if (operation === 0) tweetFound = await Tweet.findById(args[1]);
    else tweetFound = await Tweet.findById(args[0]);

    if (!tweetFound) return { message: "Tweet inexistente" };
    else {
      if (String(user.sub) !== String(tweetFound.creator)) {
        return { message: "Sin permisos para modificar tweet" };
      } else {
        if (operation === 0) {
          resultTweet = await Tweet.findByIdAndUpdate(
            args[1],
            { content: args[0] },
            { new: true }
          );
        } else {
          resultTweet = await Tweet.findByIdAndRemove(args[0]);
        }
        if (!resultTweet) return { message: "Error in the server" };
        else {
          if (operation === 0) return resultTweet;
          else return { message: "Tweet eliminado" };
        }
      }
    }
  } catch (err) {
    return { message: "Error in the server" };
  }
};

const listTweets = async (args) => {
  try {
    if (args[0] === "*") {
      const allTweets = await Tweet.find({})
        .populate("creator", "-password -following -followers -name -email")
        .populate("likes", "-_id -interactors")
        .populate("replies", "-_id");
      if (!allTweets) return { message: "No se puede visualizar tweets" };
      else return allTweets;
    } else {
      const userFound = await User.findOne({ username: args[0] });
      if (!userFound) return { message: "Usuario inexistente" };
      else {
        const tweets = await Tweet.find({ creator: userFound._id })
          .populate("creator", "username")
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        if (!tweets) return { message: "No se obtuvieron tweets" };
        else if (tweets.length === 0)
          return { message: `${userFound.username} Todavia no hay tweets` };
        else return tweets;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};


const follow = async (user, args) => {
  try {
    const toFollow = await User.findOne({ username: args[0] });
    if (!toFollow) return { message: "Usuario inexistente" };
    else {
      const alreadyFollowed = await User.findOne({
        $and: [{ _id: user.sub }, { following: { _id: toFollow._id } }],
      });
      if (alreadyFollowed)
        return { message: `Estas siguiendo a ${toFollow.username}` };
      else {
        const addFollowing = await User.findByIdAndUpdate(
          user.sub,
          { $push: { following: toFollow } },
          { new: true }
        )
          .populate("following", "-password -following -followers -name -email")
          .populate(
            "followers",
            "-password -following -followers -name -email"
          );
        const addFollower = await User.findByIdAndUpdate(toFollow._id, {
          $push: { followers: user.sub },
        });
        if (addFollowing && addFollower) {
          return addFollowing;
        } else {
          return { message: `No se pudo seguir a ${toFollow.username}` };
        }
      }
    }
  } catch (err) {
    return { message: "Error in the server" };
  }
};

const unfollow = async (user, args) => {
  try {
    const toUnFollow = await User.findOne({ username: args[0] });
    if (!toUnFollow) return { message: "Usuario inexistente" };
    else {
      const following = await User.findOne({
        $and: [{ _id: user.sub }, { following: { _id: toUnFollow._id } }],
      });
      if (!following) return { message: `Sin seguir a ${toUnFollow.username}` };
      else {
        const stopFollowing = await User.findByIdAndUpdate(
          user.sub,
          { $pull: { following: toUnFollow._id } },
          { new: true }
        )
          .populate("following", "-following -password -followers -name -email")
          .select("username");

        const removeFollower = await User.findByIdAndUpdate(toUnFollow._id, {
          $pull: { followers: user.sub },
        });

        if (stopFollowing && removeFollower) {
          return stopFollowing;
        } else {
          return {
            message: `No se pudo dejar de seguir a ${toUnFollow.username}`,
          };
        }
      }
    }
  } catch (err) {
    return { message: "Error in the server" };
  }
};


const profile = async (user, args) => {
  try {
    const following = await User.findOne({ username: args[0] })
      .populate("following", "-following -password -followers -name -email")
      .populate("followers", "-followers -password -following -name -email");
    if (!following) {
      return { message: "Perfil inexistente" };
    } else {
      return following;
    }
  } catch (error) {}
};

const doLike = async (id, userId) => {
  try {
    const liked = await Like.findOneAndUpdate(
      { _id: id },
      { $push: { interactors: userId }, $inc: { likes: 1 } }
    );
    if (!liked) return { message: "No se pudo dar like" };
    else return { message: "Te gusta este tweet" };
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};

const dislike = async (id, userId) => {
  try {
    const disliked = await Like.findOneAndUpdate(
      { _id: id },
      { $pull: { interactors: userId }, $inc: { likes: -1 } }
    );
    if (!disliked) return { message: "No se pudo quitar el like" };
    else return { message: "Haz quitado tu like" };
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};

const like = async (user, args) => {
  try {
    const tweet = await Tweet.findById(args[0]);
    if (!tweet) return { message: "Tweet inexistente" };
    else {
      const previusReactions = await Like.findOne({
        $and: [{ _id: tweet.likes }, { interactors: { _id: user.sub } }],
      });
      if (!previusReactions) {
        const toLike = await Like.findById(tweet._id);
        return await doLike(toLike._id, user.sub);
      } else return await dislike(previusReactions._id, user.sub);
    }
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};

const retweet = async (user, args) => {
  try {
    const tweetExists = await Tweet.findById(args[1]);
    if (!tweetExists) return { message: "Tweet inexistente" };
    else {
      const newRetweet = new Retweet();
      newRetweet.creator = user.sub;

      if (args[0] !== "") newRetweet.title = args[0];

      const retweetAdded = await newRetweet.save();
      if (!retweetAdded) return { message: "Sin poder guardar el retweet" };
      else {
        const updateTweet = await Tweet.findByIdAndUpdate(
          tweetExists._id,
          {
            $push: { retweets: retweetAdded._id },
          },
          { new: true }
        )
          .populate("creator", "username")
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ])
          .populate([
            {
              path: "retweets",
              select: "-_id",
              populate: {
                path: "creator",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        return !updateTweet
          ? { message: "No se hizo el retweet" }
          : updateTweet;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};

const reply = async (user, args) => {
  try {
    const newReply = new Reply();
    const tweetFound = await Tweet.findById(args[1]);
    if (!tweetFound) return { message: "Tweet inexistente" };
    else {
      newReply.author = user.sub;
      newReply.content = args[0];
      const newReplyAdded = await newReply.save();
      if (!newReplyAdded)
        return { message: "Sin poder guardar la repuesta" };
      else {
        const addReply = await Tweet.findByIdAndUpdate(
          tweetFound._id,
          {
            $push: { replies: newReplyAdded._id },
          },
          { new: true }
        )
          .populate(
            "creator",
            "-_id -password -following -followers -name -email"
          )
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        return !addReply
          ? { message: "No se respondio al tweet" }
          : addReply;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error in the server" };
  }
};



const actions = async (user, { command, args }) => {
  try {
    if (command === "invalid command") return { message: "COMANDO INVALIDO" };
    else if (args === "invalid arguments")
      return { message: "ARGUMENTOS INVALIDOS" };
    else {
      switch (command.toLowerCase()) {
        case "register":
          return await register(args);
          break;
        case "login":
          return await login(args);
          break;
        case "view_tweets":
          return await listTweets(args);
          break;
        case "add_tweet":
          return await createTweet(user, args);
          break;
        case "edit_tweet":
          return await editNDelete(user, args, 0);
          break;
        case "delete_tweet":
          return await editNDelete(user, args, 1);
          break;
        case "view_tweets":
          return await listTweets(args);
          break;
        case "profile":
          return await profile(user, args);
          break;
        case "follow":
          return await follow(user, args);
          break;
        case "unfollow":
          return await unfollow(user, args);
          break;
        case "like_tweet":
          return await like(user, args);
          break;
        case "reply_tweet":
          return await reply(user, args);
          break;
        case "retweet":
          return await retweet(user, args);
          break;
        default:
          return { message: "COMANDO INVALIDO" };
      }
    }
  } catch (err) {
    return err;
  }
};

module.exports = {
  commands,
};
