<?php

namespace Melodycode\FossdroidBundle\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * Review
 *
 * Anonymous, rate-limited (per D-STORE.md §5: no accounts, so reviews
 * carry no author identity — see `ip_hash` below — and submission
 * frequency is limited per-source rather than per-user). This entity
 * is the data model only; the actual rate-limit *enforcement* (the
 * query that checks it and the controller that rejects over-limit
 * submissions) is a later leaf once the API layer exists — this leaf
 * only shapes the schema to make that possible, the same way
 * `ip_hash`/`created_at` together are what a rate-limit query needs.
 */
class Review
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
     * @var integer
     */
    private $rating;

    /**
     * @var string
     */
    private $comment;

    /**
     * @var string
     */
    private $ip_hash;

    /**
     * @var \DateTime
     */
    private $created_at;


    /**
     * Set id
     *
     * @param string $id
     * @return Review
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
     * Set rating
     *
     * @param integer $rating
     * @return Review
     */
    public function setRating($rating)
    {
        $this->rating = $rating;

        return $this;
    }

    /**
     * Get rating
     *
     * @return integer 
     */
    public function getRating()
    {
        return $this->rating;
    }

    /**
     * Set comment
     *
     * @param string $comment
     * @return Review
     */
    public function setComment($comment)
    {
        $this->comment = $comment;

        return $this;
    }

    /**
     * Get comment
     *
     * @return string 
     */
    public function getComment()
    {
        return $this->comment;
    }

    /**
     * Set ip_hash
     *
     * @param string $ipHash
     * @return Review
     */
    public function setIpHash($ipHash)
    {
        $this->ip_hash = $ipHash;

        return $this;
    }

    /**
     * Get ip_hash
     *
     * @return string 
     */
    public function getIpHash()
    {
        return $this->ip_hash;
    }

    /**
     * Set created_at
     *
     * @param \DateTime $createdAt
     * @return Review
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
     * @return Review
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
