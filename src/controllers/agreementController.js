import { getCurrentAgreement } from "../services/agreementService.js";
import { acceptCurrentTerms } from "../services/userService.js";
import { createAppError } from "../utils/error.js";

// Public: the register page shows the terms before any account exists.
export const getCurrent = async (req, res, next) => {
  const agreement = await getCurrentAgreement();
  if (!agreement) {
    throw createAppError("No Terms of Service are available", 404, "TERMS_UNAVAILABLE");
  }

  res.status(200).json({
    success: true,
    data: {
      termsVersion: agreement.termsVersion,
      agreementText: agreement.agreementText,
      dateImplemented: agreement.dateImplemented,
    },
  })
}

export const accept = async (req, res, next) => {
  const { termsVersion } = req.body;
  const session = await acceptCurrentTerms(req.auth, { termsVersion });

  res.status(200).json({
    success: true,
    message: "Terms accepted",
    data: session,
  })
}
