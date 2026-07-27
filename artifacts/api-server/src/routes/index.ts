import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import uploadsRouter from "./uploads";
import settingsRouter from "./settings";
import docsRouter from "./docs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(uploadsRouter);
router.use(settingsRouter);
router.use(docsRouter);

export default router;
