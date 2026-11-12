import { useState } from 'react';
import { applyReshuffle, createReshuffleProposal } from './scheduleReshuffle.js';

export function useScheduleReshuffle({ appointments, setAppointments, onOpen, onApplied }) {
  const [review, setReview] = useState(null);

  function begin(proposal) {
    const request = {
      jobId: proposal.job.id,
      engineerId: proposal.engineerId ?? proposal.targetEngineerId ?? proposal.job.engineerId,
      startAt: proposal.startAt ?? proposal.job.startAt,
      endAt: proposal.endAt,
    };
    try { setReview({ proposal: createReshuffleProposal(appointments, request), error: '' }); }
    catch (error) { setReview({ proposal: null, error: error.message }); }
    onOpen();
  }

  function confirm() {
    try {
      const updated = applyReshuffle(appointments, review.proposal);
      setAppointments(updated);
      onApplied(review.proposal);
      const jobId = review.proposal.incoming.id;
      setReview(null);
      requestAnimationFrame(() => {
        const card = document.querySelector(`button[data-job-id="${jobId}"]`);
        if (card instanceof HTMLElement) card.focus();
      });
    } catch (error) { setReview(current => ({ ...current, error: error.message })); }
  }

  return { review, begin, confirm, cancel: () => setReview(null) };
}
