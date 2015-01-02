var mongoose = require('mongoose'),
Schema = mongoose.Schema,
ObjectId = Schema.Types.ObjectId,
Mixed = Schema.Types.Mixed;

var schema = Schema({

  present: {
    type: Boolean,
  },

  observed: {
    type: String,
  },

  actual: {
    type:String,
  },

  selected: {
    type:String,
  },

  deltat:{
    type:Number
  },

  userId: {
    type:Number
  }
});

// Define the model.
module.exports = mongoose.model('Answer', schema);
