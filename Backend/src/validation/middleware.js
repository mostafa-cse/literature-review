const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');

/**
 * Custom error class for domain DTO validation failures
 */
class DomainValidationError extends Error {
  constructor(details = [], message = 'Domain validation failed') {
    const primaryMsg = details.length > 0 && details[0].message ? details[0].message : message;
    super(primaryMsg);
    this.name = 'DomainValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

/**
 * Express middleware for Zod schema validation across body, query, and params
 * @param {Object} schemas - { body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }
 */
function validateRequest(schemas = {}) {
  return (req, res, next) => {
    const errorDetails = [];

    // 1. Validate URL Params
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          errorDetails.push({
            field: issue.path.join('.') || 'params',
            message: issue.message,
            code: issue.code,
            location: 'params',
          });
        });
      } else {
        req.params = result.data;
      }
    }

    // 2. Validate Query Parameters
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          errorDetails.push({
            field: issue.path.join('.') || 'query',
            message: issue.message,
            code: issue.code,
            location: 'query',
          });
        });
      } else {
        req.query = result.data;
      }
    }

    // 3. Validate Request Body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body || {});
      if (!result.success) {
        result.error.issues.forEach(issue => {
          errorDetails.push({
            field: issue.path.join('.') || 'body',
            message: issue.message,
            code: issue.code,
            location: 'body',
          });
        });
      } else {
        req.body = result.data;
      }
    }

    if (errorDetails.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errorDetails,
      });
    }

    next();
  };
}

/**
 * Express middleware for class-validator DTO validation
 * @param {Function} DtoClass - Class constructor
 * @param {'body'|'query'|'params'} location - Request property to validate
 */
function validateDto(DtoClass, location = 'body') {
  return async (req, res, next) => {
    try {
      const plain = req[location] || {};
      const instance = plainToInstance(DtoClass, plain);
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: false,
      });

      if (errors.length > 0) {
        const details = errors.map(err => ({
          field: err.property,
          constraints: err.constraints,
          message: Object.values(err.constraints || {})[0] || 'Invalid value',
          location,
        }));

        return res.status(400).json({
          success: false,
          error: 'DTO validation failed',
          details,
        });
      }

      req[location] = instance;
      next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

/**
 * Programmatic DTO validation for background worker jobs & domain services
 * @param {Function} DtoClass - Class constructor
 * @param {Object} plainObject - Plain data payload
 * @returns {Promise<Object>} The validated DTO instance
 */
async function validateDomainDto(DtoClass, plainObject = {}) {
  const instance = plainToInstance(DtoClass, plainObject);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const details = errors.map(err => ({
      field: err.property,
      constraints: err.constraints,
      message: Object.values(err.constraints || {})[0] || 'Invalid value',
    }));

    throw new DomainValidationError(details, `Validation failed for ${DtoClass.name}`);
  }

  return instance;
}

module.exports = {
  validateRequest,
  validateDto,
  validateDomainDto,
  DomainValidationError,
};
