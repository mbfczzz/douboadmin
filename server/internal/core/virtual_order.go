package core

const MaxOrderAmountFen int64 = 10000000

// Missing fields identify legacy, single-item virtual orders.
func (v VirtualOrder) PurchaseDetails(total int64) (quantity, unitFen int64, err error) {
	quantity, unitFen = v.Quantity, v.UnitFen
	if quantity == 0 {
		quantity = 1
	}
	if unitFen == 0 && quantity == 1 {
		unitFen = total
	}
	if quantity < 1 || unitFen < 1 || total < 1 || total > MaxOrderAmountFen ||
		quantity > MaxOrderAmountFen/unitFen || quantity*unitFen != total {
		return 0, 0, ErrPaymentMismatch
	}
	return quantity, unitFen, nil
}
