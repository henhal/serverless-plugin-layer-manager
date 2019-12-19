const _ = require('lodash');

module.exports.handler = (event, context) => {
  console.log('Event: %j', event);

  console.log(`Using lodash: ${_.range(10)}`);
};