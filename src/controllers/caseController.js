import { createCase as createCaseService } from '../services/caseService.js';

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