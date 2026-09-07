const schemas = require('./schemas');
const dtos = require('./dtos');
const middleware = require('./middleware');

module.exports = {
  ...schemas,
  ...dtos,
  ...middleware,
};
