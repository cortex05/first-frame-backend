import {
  getArchivedCase as getArchivedCaseService,
  listArchivedCases as listArchivedCasesService,
} from '../services/archiveService.js';

export const listArchivedCases = async (req, res) => {
  const archivedCases = await listArchivedCasesService(req.auth);

  res.status(200).json({
    success: true,
    message: 'Archived cases retrieved successfully',
    data: archivedCases,
  });
};

export const getArchivedCase = async (req, res) => {
  const archivedCase = await getArchivedCaseService(req.params.archivedCaseId, req.auth);

  res.status(200).json({
    success: true,
    message: 'Archived case retrieved successfully',
    data: archivedCase,
  });
};
