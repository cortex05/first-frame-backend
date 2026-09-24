import {
  listCases as listCasesService,
  createCase as createCaseService,
  updateCase as updateCaseService,
  setCaseOwners as setCaseOwnersService } from '../services/caseService.js';
import { archiveCase as archiveCaseService } from '../services/archiveService.js';

export const listCases = async (req, res, next) => {
	try {
		const cases = await listCasesService(req.auth);

		res.status(200).json({
			success: true,
			message: 'Cases retrieved successfully',
			data: cases,
		});
	} catch (error) {
		next(error);
	}
};

export const createCase = async (req, res, next) => {
	try {
		const createdCase = await createCaseService(req.body, req.auth);

		res.status(201).json({
			success: true,
			message: 'Case created successfully',
			data: createdCase,
		});
	} catch (error) {
		next(error);
	}
};

export const updateCase = async (req, res, next) => {
	try {
		const updatedCase = await updateCaseService(req.params.id, req.body, req.auth);

		res.status(200).json({
			success: true,
			message: 'Case updated successfully',
			data: updatedCase,
		});
	} catch (error) {
		next(error);
	}
};

export const setCaseOwners = async (req, res, next) => {
	try {
		const updatedCase = await setCaseOwnersService(req.params.id, req.body?.owners, req.auth);

		res.status(200).json({
			success: true,
			message: 'Case owners updated successfully',
			data: updatedCase,
		});
	} catch (error) {
		next(error);
	}
};

export const archiveCase = async (req, res, next) => {
	try {
		const archivedCase = await archiveCaseService(req.params.id, req.auth);

		res.status(201).json({
			success: true,
			message: 'Case archived successfully',
			data: archivedCase,
		});
	} catch (error) {
		next(error);
	}
};
