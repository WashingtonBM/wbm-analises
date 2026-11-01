import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysisRouter from "./analysis";
import { requireSession } from "../middlewares/require-session";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireSession);
router.use(analysisRouter);

export default router;
