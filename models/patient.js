var mongoose = require('mongoose'),
Schema = mongoose.Schema,
ObjectId = Schema.Types.ObjectId,
Mixed = Schema.Types.Mixed;

var schema = Schema({

  first: {
    type: String,
  },

  last: {
    type:String,
  },

  file: {
    type:String,
  }
});

// Define the model.
module.exports = mongoose.model('Patient', schema);
