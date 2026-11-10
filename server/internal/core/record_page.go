package core

type RecordQuery struct {
	Fields, NotFields                           map[string]string
	FieldsIn                                    map[string][]string
	IDs                                         []string
	NotIDs                                      []string
	SortField                                   string
	AfterID                                     string
	ByID                                        bool
	Namespace, Owner, Search, Status, PartnerID string
	// OwnerIn and PartnerIn restrict rows to a provider subtree when non-nil.
	OwnerIn, PartnerIn []string
	Page, Size         int
}
type RecordPage struct {
	Items []Record `json:"items"`
	Page  int      `json:"page"`
	Size  int      `json:"size"`
	Total int      `json:"total"`
}

// UserQuery pages mini-program users for the admin list. State is
// active / disabled / archived and Access is member / owner / review / none,
// as the list labels partners' Access; empty means any.
type UserQuery struct {
	Search, State, Access string
	Page, Size            int
}

func (q UserQuery) Valid() bool {
	states := map[string]bool{"": true, "active": true, "disabled": true, "archived": true}
	access := map[string]bool{"": true, "member": true, "owner": true, "review": true, "none": true}
	return states[q.State] && access[q.Access] && q.Page >= 1 && q.Page <= 1000000 && q.Size >= 1 && q.Size <= 100 && len([]rune(q.Search)) <= 100
}
