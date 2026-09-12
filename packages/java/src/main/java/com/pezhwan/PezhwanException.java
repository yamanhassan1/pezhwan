package com.pezhwan;

/**
 * SDK exception hierarchy. All failures raised by the Java SDK extend
 * {@link PezhwanException}; network and HTTP errors extend
 * {@link PezhwanApiException}.
 */
public class PezhwanException extends RuntimeException {

    public PezhwanException(String message) {
        super(message);
    }

    public PezhwanException(String message, Throwable cause) {
        super(message, cause);
    }

    /** A non-2xx response from the identity server. */
    public static final class PezhwanApiException extends PezhwanException {
        private final int status;
        private final String code;

        private PezhwanApiException(int status, String code, String message) {
            super(formatMessage(status, code, message));
            this.status = status;
            this.code = code;
        }

        static PezhwanApiException from(int status, Models.Envelope envelope) {
            Models.ErrorBody error = envelope.error();
            String code = error == null ? "UNKNOWN" : error.code();
            String message = error == null ? "" : error.message();
            return new PezhwanApiException(status, code, message);
        }

        private static String formatMessage(int status, String code, String message) {
            String text = message == null || message.isEmpty() ? "" : ": " + message;
            return "pezhwan: HTTP " + status + " " + code + text;
        }

        public int status() {
            return status;
        }

        public String code() {
            return code;
        }

        public boolean isAuthFailure() {
            return status == 401;
        }

        public boolean isRateLimited() {
            return status == 429;
        }
    }

    /** Wraps network-level failures (I/O and interrupt). */
    public static final class PezhwanNetworkException extends PezhwanException {
        public PezhwanNetworkException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}