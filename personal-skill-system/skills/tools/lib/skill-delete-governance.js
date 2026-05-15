'use strict';

const {
  normalizeEvolutionLedgerStatus,
  isActiveOpportunityStatus,
  isActiveAdmissionStatus,
  isActivePendingScaffoldStatus,
  isImplementedEvolutionLedgerStatus
} = require('./skill-future-governance');

function normalizeString(value) {
  return String(value == null ? '' : value).trim();
}

function buildDeleteDependencySummary(skillName, context = {}) {
  const normalizedSkill = normalizeString(skillName);
  const blockers = [];
  const history = [];

  const opportunityEntries = Array.isArray(context.opportunityEntries) ? context.opportunityEntries : [];
  for (const entry of opportunityEntries) {
    const opportunityId = normalizeString(entry && entry['opportunity-id']);
    const status = normalizeString(entry && entry.status);
    const adjacentSkills = Array.isArray(entry && entry['adjacent-skills']) ? entry['adjacent-skills'] : [];
    const createdSkill = normalizeString(entry && entry['created-skill']);
    const admissionRequestId = normalizeString(entry && entry['admission-request-id']);
    const referencesAdjacent = adjacentSkills.some((item) => normalizeString(item) === normalizedSkill);

    if (referencesAdjacent && isActiveOpportunityStatus(status)) {
      blockers.push({
        type: 'active-opportunity-adjacent-skill',
        file: 'registry/skill-opportunity-queue.generated.json',
        message: `active skill opportunity '${opportunityId || 'unknown'}' still lists '${normalizedSkill}' as an adjacent skill`,
        'opportunity-id': opportunityId || null
      });
    } else if (referencesAdjacent) {
      history.push({
        type: 'closed-opportunity-adjacent-skill',
        file: 'registry/skill-opportunity-queue.generated.json',
        'opportunity-id': opportunityId || null,
        status: status || null
      });
    }

    if (createdSkill === normalizedSkill) {
      if (status === 'implemented') {
        history.push({
          type: 'implemented-opportunity-created-skill',
          file: 'registry/skill-opportunity-queue.generated.json',
          'opportunity-id': opportunityId || null,
          ...(admissionRequestId ? { 'admission-request-id': admissionRequestId } : {})
        });
      } else {
        blockers.push({
          type: 'nonterminal-opportunity-created-skill',
          file: 'registry/skill-opportunity-queue.generated.json',
          message: `skill opportunity '${opportunityId || 'unknown'}' still points at created-skill '${normalizedSkill}' while status is '${status || 'unknown'}'`,
          'opportunity-id': opportunityId || null
        });
      }
    }
  }

  const admissionEntries = Array.isArray(context.admissionEntries) ? context.admissionEntries : [];
  for (const entry of admissionEntries) {
    const requestId = normalizeString(entry && entry['request-id']);
    const status = normalizeString(entry && entry.status);
    const decision = entry && entry.decision && typeof entry.decision === 'object' ? entry.decision : {};
    const targetSkill = normalizeString(decision.target_skill);
    const primarySkill = normalizeString(decision.primary_skill);
    const competingSkill = normalizeString(decision.competing_skill);
    const createdSkill = normalizeString(entry && entry['created-skill']);

    const referencesBoundary =
      targetSkill === normalizedSkill
      || primarySkill === normalizedSkill
      || competingSkill === normalizedSkill;

    if (referencesBoundary && isActiveAdmissionStatus(status)) {
      blockers.push({
        type: 'active-admission-boundary-reference',
        file: 'registry/admission-ledger.generated.json',
        message: `active admission request '${requestId || 'unknown'}' still depends on skill '${normalizedSkill}' for routing or boundary resolution`,
        'request-id': requestId || null
      });
    } else if (referencesBoundary) {
      history.push({
        type: 'closed-admission-boundary-reference',
        file: 'registry/admission-ledger.generated.json',
        'request-id': requestId || null,
        status: status || null
      });
    }

    if (createdSkill === normalizedSkill) {
      if (status === 'implemented') {
        history.push({
          type: 'implemented-admission-created-skill',
          file: 'registry/admission-ledger.generated.json',
          'request-id': requestId || null
        });
      } else {
        blockers.push({
          type: 'nonterminal-admission-created-skill',
          file: 'registry/admission-ledger.generated.json',
          message: `admission request '${requestId || 'unknown'}' still points at created-skill '${normalizedSkill}' while status is '${status || 'unknown'}'`,
          'request-id': requestId || null
        });
      }
    }
  }

  const pendingScaffoldEntries = Array.isArray(context.pendingScaffoldEntries) ? context.pendingScaffoldEntries : [];
  for (const entry of pendingScaffoldEntries) {
    const pendingId = normalizeString(entry && entry['pending-id']);
    const status = normalizeString(entry && entry.status);
    const skill = normalizeString(entry && entry.skill);
    if (skill !== normalizedSkill) {
      continue;
    }

    if (isActivePendingScaffoldStatus(status)) {
      blockers.push({
        type: 'active-pending-scaffold',
        file: 'registry/pending-scaffolds.generated.json',
        message: `pending scaffold '${pendingId || 'unknown'}' still targets skill '${normalizedSkill}'`,
        'pending-id': pendingId || null
      });
    } else {
      history.push({
        type: 'closed-pending-scaffold',
        file: 'registry/pending-scaffolds.generated.json',
        'pending-id': pendingId || null,
        status: status || null
      });
    }
  }

  const evolutionEntries = Array.isArray(context.evolutionEntries) ? context.evolutionEntries : [];
  let hasDeleteEvidence = false;
  for (const entry of evolutionEntries) {
    const requestId = normalizeString(entry && entry['request-id']);
    const status = normalizeString(entry && entry.status);
    const skill = normalizeString(entry && entry.skill);
    const executedAction = normalizeString(entry && entry['executed-action']);
    const resultStatus = normalizeString(entry && entry['result-status']);
    const decision = entry && entry.decision && typeof entry.decision === 'object' ? entry.decision : {};
    const targetSkill = normalizeString(decision.target_skill);
    const mergedInto = normalizeString(entry && entry['merged-into']);

    if (skill === normalizedSkill) {
      if (normalizeEvolutionLedgerStatus(status) === 'open') {
        blockers.push({
          type: 'open-evolution-request',
          file: 'registry/evolution-ledger.generated.json',
          message: `open evolution request '${requestId || 'unknown'}' still targets skill '${normalizedSkill}'`,
          'request-id': requestId || null
        });
      } else {
        history.push({
          type: 'closed-evolution-request',
          file: 'registry/evolution-ledger.generated.json',
          'request-id': requestId || null,
          status: status || null
        });
      }

      if (
        isImplementedEvolutionLedgerStatus(status)
        && (resultStatus === 'deleted' || executedAction === 'delete')
      ) {
        hasDeleteEvidence = true;
      }
    }

    if (targetSkill === normalizedSkill || mergedInto === normalizedSkill) {
      if (normalizeEvolutionLedgerStatus(status) === 'open') {
        blockers.push({
          type: 'open-evolution-peer-reference',
          file: 'registry/evolution-ledger.generated.json',
          message: `open evolution request '${requestId || 'unknown'}' still references peer skill '${normalizedSkill}'`,
          'request-id': requestId || null
        });
      } else {
        history.push({
          type: 'closed-evolution-peer-reference',
          file: 'registry/evolution-ledger.generated.json',
          'request-id': requestId || null,
          status: status || null
        });
      }
    }
  }

  const expertSourceFamilies = Array.isArray(context.expertSourceFamilies) ? context.expertSourceFamilies : [];
  for (const family of expertSourceFamilies) {
    const familyMeta = family && family.family ? family.family : {};
    const familyLabel = normalizeString(familyMeta.label) || normalizeString(familyMeta.id) || 'unknown-family';
    const integrationFile = normalizeString(familyMeta.integrationFile) || 'unknown';
    const modules = Array.isArray(family && family.modules) ? family.modules : [];
    const claimed = modules.filter((entry) => {
      const hostSkill = normalizeString(entry && entry['host-skill'] && entry['host-skill'].name);
      return hostSkill === normalizedSkill;
    });
    if (claimed.length < 1) {
      continue;
    }
    blockers.push({
      type: 'expert-source-host-skill-reference',
      file: integrationFile,
      message: `expert-source family '${familyLabel}' still maps ${claimed.length} module(s) to host skill '${normalizedSkill}'`,
      family: normalizeString(familyMeta.id) || null
    });
  }

  return {
    skill: normalizedSkill,
    blockers,
    history,
    'has-delete-evidence': hasDeleteEvidence,
    allowed: blockers.length < 1
  };
}

module.exports = {
  buildDeleteDependencySummary
};
