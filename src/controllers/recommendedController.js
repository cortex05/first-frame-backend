import {
  createRecommended as createRecommendedService,
  deleteRecommended as deleteRecommendedService,
  findRecommendedForCharge as findRecommendedForChargeService,
  getRecommendedById as getRecommendedByIdService,
  listRecommended as listRecommendedService,
  updateRecommended as updateRecommendedService,
} from '../services/recommendedService.js';

export const listRecommended = async (req, res, next) => {
  try {
    const recommended = await listRecommendedService();

    return res.status(200).json({ recommended });
  } catch (error) {
    return next(error);
  }
};

/**
 * Single set for a case's charge. Always 200 -- `recommended` is null when
 * nothing has been curated for that charge yet.
 */
export const lookupRecommended = async (req, res, next) => {
  try {
    const { charge, category } = req.query;
    const recommended = await findRecommendedForChargeService({ charge, category });

    return res.status(200).json({ recommended });
  } catch (error) {
    return next(error);
  }
};

export const getRecommendedById = async (req, res, next) => {
  try {
    const recommended = await getRecommendedByIdService(req.params.recommendedId);

    return res.status(200).json({ recommended });
  } catch (error) {
    return next(error);
  }
};

export const createRecommended = async (req, res, next) => {
  try {
    const createdBy = req.user?.id || req.user?._id || req.userId;
    const recommended = await createRecommendedService(req.body, createdBy);

    return res.status(201).json({ recommended });
  } catch (error) {
    return next(error);
  }
};

export const updateRecommended = async (req, res, next) => {
  try {
    const recommended = await updateRecommendedService(req.params.recommendedId, req.body);

    return res.status(200).json({ recommended });
  } catch (error) {
    return next(error);
  }
};

export const deleteRecommended = async (req, res, next) => {
  try {
    await deleteRecommendedService(req.params.recommendedId);

    return res.status(200).json({ message: 'Recommended deleted.' });
  } catch (error) {
    return next(error);
  }
};
