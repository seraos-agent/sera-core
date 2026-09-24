import { SnapClassificationResult } from './types';

/**
 * Standard SNAP BI Response & Error Classifier.
 * Categorizes Bank Indonesia SNAP 7-digit status codes and provider messages
 * into standard operational buckets with semantic reasons.
 */
export class SnapResponseClassifier {
  public static classify(
    httpStatus: number,
    responseCode?: string,
    responseMessage?: string
  ): SnapClassificationResult {
    const code = String(responseCode || '');
    const msg = String(responseMessage || '').toLowerCase();

    // 1. Success (200xxxx)
    if (code.startsWith('200') || (httpStatus === 200 && (msg === 'success' || msg === 'successful'))) {
      return {
        category: 'SUCCESS',
        isSuccess: true,
        isInProgress: false,
        isUnauthorized: false,
        isNotFound: false,
        isForbidden: false,
        isValidationError: false,
        isServerError: false
      };
    }

    // 2. In Progress (202xxxx)
    if (httpStatus === 202 || code.startsWith('202') || msg.includes('in progress')) {
      return {
        category: 'IN_PROGRESS',
        isSuccess: false,
        isInProgress: true,
        isUnauthorized: false,
        isNotFound: false,
        isForbidden: false,
        isValidationError: false,
        isServerError: false,
        reasonCode: 'REQUEST_IN_PROGRESS',
        userFacingMessage: 'Transaction is currently in progress upstream.'
      };
    }

    // 3. Unauthorized (401xxxx, 4000002, 4010000)
    if (
      httpStatus === 401 ||
      code.startsWith('401') ||
      code === '4000002' ||
      code === '4010000' ||
      msg.includes('unauthorized') ||
      msg.includes('invalid signature')
    ) {
      return {
        category: 'UNAUTHORIZED',
        isSuccess: false,
        isInProgress: false,
        isUnauthorized: true,
        isNotFound: false,
        isForbidden: false,
        isValidationError: false,
        isServerError: false,
        reasonCode: 'UNAUTHORIZED_SIGNATURE',
        userFacingMessage: 'Unauthorized request. Please verify SNAP BI client credentials and RSA signature.'
      };
    }

    // 4. Forbidden (403xxxx: Insufficient Funds, Transaction Not Permitted, Suspected Fraud, Do Not Honor, etc.)
    if (httpStatus === 403 || code.startsWith('403')) {
      let reason = 'FORBIDDEN';
      if (code === '4035815' || msg.includes('transaction not permitted')) {
        reason = 'TRANSACTION_NOT_PERMITTED';
      } else if (code === '4035814' || code === '4034314' || code === '4033814' || code === '4034214' || msg.includes('insufficient fund')) {
        reason = 'INSUFFICIENT_FUNDS';
      } else if (code === '4034303' || msg.includes('suspected fraud')) {
        reason = 'SUSPECTED_FRAUD';
      } else if (code === '4033805' || code === '4033705' || msg.includes('do not honor')) {
        reason = 'DO_NOT_HONOR';
      } else if (code === '4034318' || code === '4034218' || msg.includes('inactive account')) {
        reason = 'INACTIVE_ACCOUNT';
      } else if (code === '4033702' || msg.includes('exceed')) {
        reason = 'EXCEED_LIMIT';
      }

      return {
        category: 'FORBIDDEN',
        isSuccess: false,
        isInProgress: false,
        isUnauthorized: false,
        isNotFound: false,
        isForbidden: true,
        isValidationError: false,
        isServerError: false,
        reasonCode: reason,
        userFacingMessage: responseMessage || 'Transaction forbidden by payment provider.'
      };
    }

    // 5. Not Found (404xxxx: Not Found, Inconsistent Request, Merchant Status Abnormal, Invalid Status)
    if (httpStatus === 404 || code.startsWith('404')) {
      let reason = 'NOT_FOUND';
      if (code === '4045818' || code === '4045418' || code === '4044318' || code === '4043818' || msg.includes('inconsistent request')) {
        reason = 'INCONSISTENT_REQUEST';
      } else if (code === '4045808' || msg.includes('merchant status abnormal') || msg.includes('invalid merchant')) {
        reason = 'MERCHANT_STATUS_ABNORMAL';
      } else if (code === '4045800' || code === '4045700' || msg.includes('invalid transaction status')) {
        reason = 'INVALID_TRANSACTION_STATUS';
      } else if (code === '4045801' || code === '4043901' || msg.includes('not found')) {
        reason = 'TRANSACTION_NOT_FOUND';
      }

      return {
        category: 'NOT_FOUND',
        isSuccess: false,
        isInProgress: false,
        isUnauthorized: false,
        isNotFound: true,
        isForbidden: false,
        isValidationError: false,
        isServerError: false,
        reasonCode: reason,
        userFacingMessage: responseMessage || 'Resource or transaction not found upstream.'
      };
    }

    // 6. Validation (400xxxx: Missing Mandatory Field, Invalid Field Format)
    if (httpStatus === 400 || code.startsWith('400')) {
      let reason = 'VALIDATION_ERROR';
      if (code.endsWith('02') || msg.includes('mandatory field')) {
        reason = 'MISSING_MANDATORY_FIELD';
      } else if (code.endsWith('01') || msg.includes('invalid field format')) {
        reason = 'INVALID_FIELD_FORMAT';
      }

      return {
        category: 'VALIDATION',
        isSuccess: false,
        isInProgress: false,
        isUnauthorized: false,
        isNotFound: false,
        isForbidden: false,
        isValidationError: true,
        isServerError: false,
        reasonCode: reason,
        userFacingMessage: responseMessage || 'Invalid request parameter or field format.'
      };
    }

    // 7. Server Error (500xxxx, 502, 503, 504)
    if (httpStatus >= 500 || code.startsWith('500') || msg.includes('internal server error') || msg.includes('general error')) {
      return {
        category: 'SERVER_ERROR',
        isSuccess: false,
        isInProgress: false,
        isUnauthorized: false,
        isNotFound: false,
        isForbidden: false,
        isValidationError: false,
        isServerError: true,
        reasonCode: 'INTERNAL_SERVER_ERROR',
        userFacingMessage: 'Upstream payment provider encountered an internal error. Transaction held pending retry.'
      };
    }

    return {
      category: 'UNKNOWN',
      isSuccess: false,
      isInProgress: false,
      isUnauthorized: false,
      isNotFound: false,
      isForbidden: false,
      isValidationError: false,
      isServerError: false,
      userFacingMessage: responseMessage || 'Unknown payment provider response.'
    };
  }
}
