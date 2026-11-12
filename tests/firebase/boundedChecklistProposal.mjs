/** EMULATOR-ONLY rule proposal. No Firebase config references this generator. */
export function boundedChecklistProposal(source) {
  const start = source.indexOf("          function validAnswers(data, initial) {");
  const end = source.indexOf("          function validShape(data)", start);
  if (start < 0 || end < 0) throw new Error("Review proposal against changed rules before running");
  const original = source.slice(start, end);
  const guard = "questions.size() <= 8";
  const final = "&& answerAt(answers, questions, 7, allowedResults, initial);";
  if (original.split(guard).length !== 2 || original.split(final).length !== 2) throw new Error("Unexpected answer validation; manual security review required");
  const callsStart = original.indexOf("              && answerAt(answers, questions, 0");
  const callsEnd = original.indexOf(final) + final.length;
  if (callsStart < 0) throw new Error("Unexpected validator structure");
  // Branch once and inline bounds: Sixteen calls through answerAt exhaust the
  // 1000-expression budget, including during creation. Keep all field checks.
  const initial = Array.from({ length: 9 }, (_, index) => `(questions.size() <= ${index} || answers[${index}] == { "questionId": questions[${index}].id, "result": null, "notes": "" })`).join("\n                && ");
  const edited = Array.from({ length: 9 }, (_, index) => `(questions.size() <= ${index} || validAnswer(answers[${index}], questions[${index}], allowedResults))`).join("\n                && ");
  const extended = original.slice(0, callsStart).replace(guard, "questions.size() <= 9")
    + `              && (initial\n                ? (${initial})\n                : (${edited}));`
    + original.slice(callsEnd);
  return source.slice(0, start) + extended + source.slice(end);
}
