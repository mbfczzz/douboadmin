package core

type RecordQuery struct {
	AfterID                                     string
	ByID                                        bool
	Namespace, Owner, Search, Status, PartnerID string
	Page, Size                                  int
}
type RecordPage struct {
	Items []Record `json:"items"`
	Page  int      `json:"page"`
	Size  int      `json:"size"`
	Total int      `json:"total"`
}
