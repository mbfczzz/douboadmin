package store

import (
	"doubo/server/internal/core"
	"sort"
	"strings"
)

// Administrative cascades need a complete snapshot, not List's 500-row cap.
func (t *mysqlTransaction) Records(ns string) ([]core.Record, error) {
	table, e := tableOf(ns)
	if e != nil {
		return nil, e
	}
	return listRows(t.ctx, t.tx, "SELECT "+table.selectList()+" FROM `"+table.Name+"` ORDER BY id", table)
}
func (t *memoryTransaction) Records(ns string) ([]core.Record, error) {
	if _, e := tableOf(ns); e != nil {
		return nil, e
	}
	out := []core.Record{}
	for key, row := range t.records {
		if strings.HasPrefix(key, ns+":") {
			out = append(out, copyRecord(row))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}
