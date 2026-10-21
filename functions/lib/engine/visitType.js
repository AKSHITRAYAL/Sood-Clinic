const COLORS = new Set(['blue', 'green', 'amber', 'violet', 'rose', 'slate']);
const MODES = new Set(['in_person', 'video']);
const QUESTION_TYPES = new Set(['text', 'select', 'checkbox']);

const isMultipleOfFive = (value) => Number.isInteger(value) && value % 5 === 0;
const isSlug = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{1,60}$/.test(value);

const validateVisitType = (input) => {
  const errors = {};
  const value = input || {};
  if (typeof value.label !== 'string' || value.label.length < 1 || value.label.length > 80) errors.label = 'label';
  if (!isSlug(value.slug)) errors.slug = 'slug';
  if (!MODES.has(value.mode)) errors.mode = 'mode';
  for (const field of ['minutes', 'bufferBeforeMinutes', 'bufferAfterMinutes', 'intervalMinutes']) {
    const max = field === 'minutes' ? 240 : field === 'intervalMinutes' ? 240 : 120;
    if (!isMultipleOfFive(value[field]) || value[field] < 0 || value[field] > max || (field === 'minutes' && value[field] < 5)) errors[field] = field;
  }
  if (!Number.isInteger(value.minNoticeMinutes) || value.minNoticeMinutes < 0 || value.minNoticeMinutes > 10080) errors.minNoticeMinutes = 'minNoticeMinutes';
  if (!Number.isInteger(value.maxAdvanceDays) || value.maxAdvanceDays < 1 || value.maxAdvanceDays > 180) errors.maxAdvanceDays = 'maxAdvanceDays';
  if (value.dailyLimit !== null && (!Number.isInteger(value.dailyLimit) || value.dailyLimit < 1)) errors.dailyLimit = 'dailyLimit';
  if (!COLORS.has(value.color)) errors.color = 'color';
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) errors.sortOrder = 'sortOrder';
  if (!Array.isArray(value.doctorIds) || value.doctorIds.some((id) => typeof id !== 'string' || id.length > 128)) errors.doctorIds = 'doctorIds';
  if (!Array.isArray(value.intakeQuestions) || value.intakeQuestions.length > 8) {
    errors.intakeQuestions = 'intakeQuestions';
  } else {
    value.intakeQuestions.forEach((question, index) => {
      if (!question || typeof question.id !== 'string' || question.id.length < 1 || question.id.length > 80) errors[`intakeQuestions.${index}.id`] = 'id';
      if (!question || typeof question.label !== 'string' || question.label.length < 1 || question.label.length > 200) errors[`intakeQuestions.${index}.label`] = 'label';
      if (!question || !QUESTION_TYPES.has(question.type)) errors[`intakeQuestions.${index}.type`] = 'type';
      if (!question || typeof question.required !== 'boolean') errors[`intakeQuestions.${index}.required`] = 'required';
      if (!question || !Array.isArray(question.options) || question.options.some((option) => typeof option !== 'string' || option.length > 200)) errors[`intakeQuestions.${index}.options`] = 'options';
    });
  }
  if (value.pricePaise !== null && (!Number.isInteger(value.pricePaise) || value.pricePaise < 0)) errors.pricePaise = 'pricePaise';
  if (typeof value.requiresConfirmation !== 'boolean') errors.requiresConfirmation = 'requiresConfirmation';
  if (typeof value.active !== 'boolean') errors.active = 'active';
  return { ok: Object.keys(errors).length === 0, errors };
};

module.exports = { COLORS, MODES, QUESTION_TYPES, validateVisitType };
