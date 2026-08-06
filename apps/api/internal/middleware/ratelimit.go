package middleware

import (
	"net/http"
	"sync"
	"time"

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

// RateLimit returns a Gin middleware that rejects requests once the per-IP
// budget is exhausted, responding with 429 and a Retry-After header.
func RateLimit(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rl == nil || rl.allow(c.ClientIP()) {
			c.Next()
			return
		}
		c.Header("Retry-After", "60")
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, try again later"})
	}
}
