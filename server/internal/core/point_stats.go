package core

// PointStats uses hundredths of a point. Period totals follow immutable
// settlement ledger timestamps; Reserved is a current, all-time snapshot.
type PointStats struct {
	SpentUnits    int64 `json:"spentUnits"`
	ImageUnits    int64 `json:"imageUnits"`
	VideoUnits    int64 `json:"videoUnits"`
	OtherUnits    int64 `json:"otherUnits"`
	ChargedJobs   int64 `json:"chargedJobs"`
	ReservedUnits int64 `json:"reservedUnits"`
	ReservedJobs  int64 `json:"reservedJobs"`
	ReleasedUnits int64 `json:"releasedUnits"`
	ReleasedJobs  int64 `json:"releasedJobs"`
}
