package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"main/apps/api/internal/auth"

	"github.com/gin-gonic/gin"
)

type rateBucket struct {
	tokens int
	last   time.Time
}

// RateLimiter is a simple in-memory sliding-window token bucket keyed by an
// arbitrary string (usually the client IP). It is intended to blunt brute
// force and abuse; it is not a substitute for per-user throttling at scale.
type RateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	buckets  map[string]*rateBucket
	done     chan struct{}
	stopOnce sync.Once
}

// NewRateLimiter creates a limiter allowing up to `limit` requests per
// `window` from the same key. It starts a background janitor that drops idle
// buckets so the map does not grow unbounded.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		limit:   limit,
		window:  window,
		buckets: make(map[string]*rateBucket),
		done:    make(chan struct{}),
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window)
	defer ticker.Stop()
	for {
		select {
		case <-rl.done:
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-rl.window)
			rl.mu.Lock()
			for key, b := range rl.buckets {
				if b.last.Before(cutoff) {
					delete(rl.buckets, key)
				}
			}
			rl.mu.Unlock()
		}
	}
}

// Stop halts the background janitor. Safe to call more than once.
func (rl *RateLimiter) Stop() {
	rl.stopOnce.Do(func() { close(rl.done) })
}

func (rl *RateLimiter) allow(key string) bool {
	now := time.Now()

	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok {
		b = &rateBucket{tokens: rl.limit, last: now}
		rl.buckets[key] = b
	}

	elapsed := now.Sub(b.last)
	if elapsed >= rl.window {
		b.tokens = rl.limit
		b.last = now
	} else {
		refill := int(elapsed / (rl.window / time.Duration(rl.limit)))
		if refill > 0 {
			b.tokens += refill
			if b.tokens > rl.limit {
				b.tokens = rl.limit
			}
			b.last = b.last.Add(time.Duration(refill) * (rl.window / time.Duration(rl.limit)))
		}
	}

	if b.tokens > 0 {
		b.tokens--
		return true
	}
	return false
}

// retryAfter returns how long the caller must wait before the bucket for key
// refills to its full budget, so clients get an accurate Retry-After header.
func (rl *RateLimiter) retryAfter(key string) time.Duration {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	b, ok := rl.buckets[key]
	if !ok || b.tokens >= rl.limit {
		return 0
	}

	// The bucket refills one token every window/limit; report how long until
	// it is full again (capped at the full window for safety).
	refillInterval := rl.window / time.Duration(rl.limit)
	elapsed := time.Since(b.last)
	remaining := rl.window - elapsed
	if remaining < 0 {
		remaining = 0
	}
	wait := remaining - refillInterval
	if wait < 0 {
		wait = 0
	}
	return wait
}

// keyFunc extracts the throttle key for a request.
type keyFunc func(c *gin.Context) string

func clientIPKey(c *gin.Context) string {
	return c.ClientIP()
}

func userKey(c *gin.Context) string {
	if claims, ok := auth.GetClaims(c); ok {
		return fmt.Sprintf("user:%d", claims.UserID)
	}
	return c.ClientIP()
}

// RateLimit returns a Gin middleware that rejects requests once the per-IP
// budget is exhausted, responding with 429 and a Retry-After header.
func RateLimit(rl *RateLimiter) gin.HandlerFunc {
	return RateLimitByKey(rl, clientIPKey)
}

// UserRateLimit throttles by the authenticated user ID when present, falling
// back to the client IP for unauthenticated requests. Apply it after auth
// middleware so claims are available.
func UserRateLimit(rl *RateLimiter) gin.HandlerFunc {
	return RateLimitByKey(rl, userKey)
}

// RateLimitByKey applies a limiter using an arbitrary key extractor.
func RateLimitByKey(rl *RateLimiter, key keyFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rl == nil {
			c.Next()
			return
		}
		key := key(c)
		if rl.allow(key) {
			c.Next()
			return
		}
		if wait := rl.retryAfter(key); wait > 0 {
			seconds := int(wait.Seconds())
			if seconds < 1 {
				seconds = 1
			}
			c.Header("Retry-After", fmt.Sprintf("%d", seconds))
		} else {
			c.Header("Retry-After", "60")
		}
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, try again later"})
	}
}
