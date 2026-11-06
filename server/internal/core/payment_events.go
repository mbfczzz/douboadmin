package core

// RefundSubmissionEventID links the transactional refund outbox to its worker.
func RefundSubmissionEventID(orderID, refundID string) string {
	return Digest("refund_submission::" + orderID + ":" + refundID)[:32]
}
