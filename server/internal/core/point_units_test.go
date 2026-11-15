package core

import (
	"math"
	"testing"
)

func TestPerSecondPricesDoNotGainFractionalPointUnits(t *testing.T) {
	for _, rateCents := range []int64{0, 1, 10, 13_00, 6_990_874, 3_333_333_333} {
		for seconds := int64(1); seconds <= 30; seconds++ {
			want := rateCents * seconds
			points := float64(want) / 100
			got, err := PointUnits(points)
			if err != nil || got != want {
				t.Fatalf("rate cents=%d seconds=%d points=%v: got %d, want %d (%v)", rateCents, seconds, points, got, want, err)
			}
		}
	}
}

func TestPointUnitsRetainsRoundUpAndInvalidPriceGuards(t *testing.T) {
	for _, tt := range []struct {
		points float64
		units  int64
	}{{0, 0}, {0.1, 10}, {0.301, 31}, {1.001, 101}, {1e9, 100_000_000_000}} {
		got, err := PointUnits(tt.points)
		if err != nil || got != tt.units {
			t.Fatal(tt, got, err)
		}
	}
	for _, bad := range []float64{-1, math.NaN(), math.Inf(1), 1e9 + 1} {
		if _, err := PointUnits(bad); err == nil {
			t.Fatal("invalid price accepted", bad)
		}
	}
}
