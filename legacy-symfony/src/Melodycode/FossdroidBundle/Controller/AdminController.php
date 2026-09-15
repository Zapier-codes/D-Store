<?php

namespace Melodycode\FossdroidBundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;

/**
 * AdminController — leaf 2.b.iii.zo.
 *
 * Everything under here is gated by the `admin` firewall + access_control
 * in app/config/security.yml (HTTP Basic, ROLE_ADMIN) — no per-action
 * @Security annotation needed, same declarative-access_control style
 * the rest of this app uses (no annotations anywhere else either).
 */
class AdminController extends Controller {

    public function reportQueueAction() {
        $repository = $this->getDoctrine()->getRepository('MelodycodeFossdroidBundle:ReportFlag');
        $reports = $repository->findByStatus('open');

        return $this->render('MelodycodeFossdroidBundle:Admin:report_queue.html.twig', array(
                    'reports' => $reports
        ));
    }

}
