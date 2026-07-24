import { 
  createCase as createCaseService, 
  updateCase as updateCaseService } from '../services/caseService.js';

export const createCase = async (req, res, next) => {
	try {
		const ownerId = req.user?.id || req.user?._id || req.userId;
		const createdCase = await createCaseService(req.body, ownerId);

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
		const ownerId = req.user?.id || req.user?._id || req.userId;
		const updatedCase = await updateCaseService(req.params.id, req.body, ownerId);

		res.status(200).json({
			success: true,
			message: 'Case updated successfully',
			data: updatedCase,
		});
	} catch (error) {
		next(error);
	}
};