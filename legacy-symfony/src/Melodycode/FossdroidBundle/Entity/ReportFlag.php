<?php

namespace Melodycode\FossdroidBundle\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * ReportFlag
 *
 * Anonymous app reports (per D-STORE.md §5/§7: no accounts, so no
 * reporter identity is stored — same posture as `Review`, but without
 * `Review`'s `ip_hash`/rate-limit support: docs/D-STORE.md §7 only
 * calls `Review` "rate-limited", not `ReportFlag`, so that field is
 * deliberately left out here rather than added speculatively).
 *
 * `reason` and `details` mirror the dummy `ReportAppForm.tsx`
 * (`0.f.iii.zi`) field-for-field: `reason` is one of that form's fixed
 * categories (Broken download link / Malware or security concern /
 * Inappropriate content / Copyright-DMCA issue / Other), `details` is
 * its optional free-text field.
 *
 * `status` doesn't come from the dummy form — it exists for the
 * future admin review queue (`2.b.iii.zo`, explicitly noted as real
 * backend work in `0.f.iii.zi`'s and `2.b`'s HANDOVER.md notes) to
 * filter on. New reports start `'open'`.
 */
class ReportFlag
{
    /**
     * @var string
     */
    private $id;

    /**
     * @var \Melodycode\FossdroidBundle\Entity\Application
     */
    private $application;

    /**
     * @var string
     */
    private $reason;

    /**
     * @var string
     */
    private $details;

    /**
     * @var string
     */
    private $status;

    /**
     * @var \DateTime
     */
    private $created_at;


    /**
     * Set id
     *
     * @param string $id
     * @return ReportFlag
     */
    public function setId($id)
    {
        $this->id = $id;

        return $this;
    }

    /**
     * Get id
     *
     * @return string 
     */
    public function getId()
    {
        return $this->id;
    }

    /**
     * Set reason
     *
     * @param string $reason
     * @return ReportFlag
     */
    public function setReason($reason)
    {
        $this->reason = $reason;

        return $this;
    }

    /**
     * Get reason
     *
     * @return string 
     */
    public function getReason()
    {
        return $this->reason;
    }

    /**
     * Set details
     *
     * @param string $details
     * @return ReportFlag
     */
    public function setDetails($details)
    {
        $this->details = $details;

        return $this;
    }

    /**
     * Get details
     *
     * @return string 
     */
    public function getDetails()
    {
        return $this->details;
    }

    /**
     * Set status
     *
     * @param string $status
     * @return ReportFlag
     */
    public function setStatus($status)
    {
        $this->status = $status;

        return $this;
    }

    /**
     * Get status
     *
     * @return string 
     */
    public function getStatus()
    {
        return $this->status;
    }

    /**
     * Set created_at
     *
     * @param \DateTime $createdAt
     * @return ReportFlag
     */
    public function setCreatedAt($createdAt)
    {
        $this->created_at = $createdAt;

        return $this;
    }

    /**
     * Get created_at
     *
     * @return \DateTime 
     */
    public function getCreatedAt()
    {
        return $this->created_at;
    }

    /**
     * Set application
     *
     * @param \Melodycode\FossdroidBundle\Entity\Application $application
     * @return ReportFlag
     */
    public function setApplication(\Melodycode\FossdroidBundle\Entity\Application $application = null)
    {
        $this->application = $application;

        return $this;
    }

    /**
     * Get application
     *
     * @return \Melodycode\FossdroidBundle\Entity\Application 
     */
    public function getApplication()
    {
        return $this->application;
    }
}
