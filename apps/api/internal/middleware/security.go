package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// SecurityHeaders sets conservative security-related response headers on every
// response. The API serves JSON only, so a strict default-src CSP is safe.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("X-XSS-Protection", "0")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
		c.Header("Cache-Control", "no-store")
		c.Next()
	}
}

// BodyLimit caps the size of an incoming request body to protect against
// oversized payloads. Requests that exceed the limit fail JSON parsing.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Body != nil {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
