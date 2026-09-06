import { Router } from 'express';
import { shortLinkStore } from '../../shared/utils/short-link-store';

export function createShortLinkRouter() {
  const router = Router();

  router.get('/r/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    const targetUrl = shortLinkStore.resolve(token);

    if (!targetUrl) {
      return res.status(404).send('Short link not found');
    }

    return res.redirect(302, targetUrl);
  });

  return router;
}
